import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import Link from "next/link";
import { LogReceivingForm } from "./LogReceivingForm";
import { DirectReceiptForm } from "./DirectReceiptForm";
import { EditableRow, ReceivingItemCard } from "./ReceivingItemCard";
import { editReceiving } from "./actions";
import { ActionRow } from "../orders/ActionRow";
import { OrderSearchBox } from "../orders/OrderSearchBox";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { indiaDay } from "@/lib/inventory";
import type { OrderStatus } from "@/types/database";

type Rel<T> = T | T[] | null;

/** One open item line of a PO. */
type OpenOrderRow = {
  id: string;
  purchase_order_id: string;
  quantity_ordered: number;
  status: OrderStatus;
  /** The line's own unit — receiving and approval stay in it. */
  unit: string;
  /** Optional note entered with the line on the Orders tab. */
  description: string | null;
  items: Rel<{ name: string }>;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  placed_date: string;
  shopkeepers: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

/** A logged direct receipt (no PO) and how each of its items fared at approval. */
type DirectReceiptRow = {
  id: string;
  po_number: string;
  placed_date: string;
  shopkeepers: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
  orders: {
    id: string;
    quantity_ordered: number;
    unit: string;
    status: OrderStatus;
    items: Rel<{ name: string }>;
    order_edit_log: { action: string; note: string | null }[];
    receiving_logs: { invoice_number: string | null; condition_notes: string | null }[];
  }[];
};

const DIRECT_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  placed: { label: "Pending approval", className: "border-amber-300 bg-amber-50 text-amber-800" },
  pending_approval: {
    label: "Pending approval",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  completed: { label: "Approved", className: "border-green-300 bg-green-50 text-green-800" },
  cancelled: { label: "Rejected", className: "border-red-300 bg-red-50 text-red-700" },
};

/** The delivery fields edit_receiving can change, as stored in previous_values. */
type DeliveryValues = {
  quantity_received: number;
  received_date: string;
  invoice_number: string | null;
  condition_notes: string | null;
};

const EDIT_FIELDS: { key: keyof DeliveryValues; label: string }[] = [
  { key: "quantity_received", label: "Quantity" },
  { key: "received_date", label: "Date received" },
  { key: "invoice_number", label: "Invoice" },
  { key: "condition_notes", label: "Notes" },
];

type ReceivingLogRow = {
  id: string;
  order_id: string;
  quantity_received: number;
  condition_notes: string | null;
  invoice_number: string | null;
  received_date: string;
  received_by: string;
  created_at: string;
  profiles: Rel<{ full_name: string }>;
  /** Corrections made through edit_receiving (0022_receiving_date_and_edits.sql). */
  receiving_edit_log: {
    id: string;
    edited_at: string;
    note: string | null;
    previous_values: Partial<DeliveryValues> | null;
    profiles: Rel<{ full_name: string }>;
  }[];
};

type ApprovalTimeRow = { order_id: string; created_at: string };

function one<T>(rel: Rel<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** "2,31,232" — Indian digit grouping, up to 2 decimals. */
function formatQty(n: number) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Columns of an open-order PO row: PO, vendor, items, received, placed. */
const PO_GRID =
  "grid gap-x-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)_56px_minmax(0,1.3fr)_minmax(0,0.9fr)]";

/** Columns of a direct receipt row: item, vendor, qty, date, added by, status. */
const DIRECT_GRID =
  "grid gap-x-4 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.4fr)_100px_110px_minmax(0,1fr)_140px]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; tab?: string; q?: string; new?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, tab: tabParam, q: qParam, new: newParam } = await searchParams;
  const tab = tabParam === "direct" ? "direct" : "open";
  const supabase = await createClient();

  const sites = user.sites;

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
        You&apos;re not assigned to a site yet — ask your Admin to add you before you can
        log receiving.
      </div>
    );
  }

  const selectedSiteId = await resolveSelectedSiteId(sites, siteParam);

  const canReceiveHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho2_receiving",
    );

  const OPEN_STATUSES = ["placed", "pending_approval"];

  // One parallel batch: logs and POs are filtered by site and status
  // through their order lines (`orders!inner`) instead of by a list of
  // ids, so nothing waits on the order list first — each extra wait is a
  // full round trip to the database.
  // Direct receipts (MISC- POs) aren't received against here — they're
  // already received when logged — so only real POs ('po') are listed.
  const [
    { data: ordersData },
    { data: logsData },
    { data: posData },
    { data: directData },
    { data: itemsData },
    { data: shopkeepersData },
    { data: approvalsData },
  ] = await Promise.all([
    // Lines oldest-first, so they list in the order entered on the PO.
    supabase
      .from("orders")
      .select("id, purchase_order_id, quantity_ordered, unit, description, status, items ( name ), purchase_orders!inner ( kind )")
      .eq("site_id", selectedSiteId)
      .eq("purchase_orders.kind", "po")
      .in("status", OPEN_STATUSES)
      .order("created_at"),
    supabase
      .from("receiving_logs")
      .select(
        "id, order_id, quantity_received, condition_notes, invoice_number, received_date, received_by, created_at, profiles ( full_name ), receiving_edit_log ( id, edited_at, note, previous_values, profiles ( full_name ) ), orders!inner ( site_id, status )",
      )
      .eq("orders.site_id", selectedSiteId)
      .in("orders.status", OPEN_STATUSES)
      .order("received_date", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select("id, po_number, placed_date, shopkeepers ( name ), profiles ( full_name ), orders!inner ( status )")
      .eq("site_id", selectedSiteId)
      .eq("kind", "po")
      .in("orders.status", OPEN_STATUSES)
      .order("placed_date", { ascending: false }),
    supabase
      .from("purchase_orders")
      .select(
        "id, po_number, placed_date, shopkeepers ( name ), profiles ( full_name ), orders ( id, quantity_ordered, unit, status, items ( name ), order_edit_log ( action, note ), receiving_logs ( invoice_number, condition_notes ) )",
      )
      .eq("site_id", selectedSiteId)
      .eq("kind", "direct")
      .order("placed_date", { ascending: false })
      .limit(50),
    canReceiveHere
      ? supabase.from("items").select("id, name, unit").order("name")
      : Promise.resolve({ data: [] }),
    canReceiveHere
      ? supabase.from("shopkeepers").select("id, name").order("name")
      : Promise.resolve({ data: [] }),
    // When each open line was last approved — a delivery logged before
    // that is covered by the approval and can no longer be edited.
    supabase
      .from("approvals")
      .select("order_id, created_at, orders!inner ( site_id, status )")
      .eq("orders.site_id", selectedSiteId)
      .in("orders.status", OPEN_STATUSES),
  ]);

  const lastApprovalByOrder = new Map<string, string>();
  for (const a of (approvalsData ?? []) as unknown as ApprovalTimeRow[]) {
    const prev = lastApprovalByOrder.get(a.order_id);
    if (!prev || new Date(a.created_at) > new Date(prev)) {
      lastApprovalByOrder.set(a.order_id, a.created_at);
    }
  }
  const canEditLog = (log: ReceivingLogRow) => {
    if (!canReceiveHere || (!user.isAdmin && log.received_by !== user.id)) return false;
    const lastApproval = lastApprovalByOrder.get(log.order_id);
    return !lastApproval || new Date(lastApproval) < new Date(log.created_at);
  };
  const today = indiaDay(new Date().toISOString());

  const directReceipts = (directData ?? []) as unknown as DirectReceiptRow[];

  const openOrders = (ordersData ?? []) as unknown as OpenOrderRow[];

  // Open lines grouped under their PO, newest PO first.
  const purchaseOrders = (posData ?? []) as unknown as PurchaseOrderRow[];
  const linesByPo = new Map<string, OpenOrderRow[]>();
  for (const order of openOrders) {
    const list = linesByPo.get(order.purchase_order_id) ?? [];
    list.push(order);
    linesByPo.set(order.purchase_order_id, list);
  }

  const logs = (logsData ?? []) as unknown as ReceivingLogRow[];
  const logsByOrder = new Map<string, ReceivingLogRow[]>();
  const receivedTotalByOrder = new Map<string, number>();
  for (const log of logs) {
    const list = logsByOrder.get(log.order_id) ?? [];
    list.push(log);
    logsByOrder.set(log.order_id, list);
    receivedTotalByOrder.set(
      log.order_id,
      (receivedTotalByOrder.get(log.order_id) ?? 0) + Number(log.quantity_received),
    );
  }

  const q = (qParam ?? "").trim().toLowerCase();
  const base = `/receiving?site=${selectedSiteId}`;
  const directHref = `${base}&tab=direct`;

  // ── Open orders: search matches the PO number, vendor or an item. When
  // only some items of a PO match, the PO opens showing just those.
  const visiblePos = purchaseOrders.flatMap((po) => {
    const lines = linesByPo.get(po.id) ?? [];
    if (!q) return [{ po, lines, itemMatch: false }];
    const poMatch =
      po.po_number.toLowerCase().includes(q) ||
      (one(po.shopkeepers)?.name.toLowerCase().includes(q) ?? false);
    if (poMatch) return [{ po, lines, itemMatch: false }];
    const matching = lines.filter(
      (l) => one(l.items)?.name.toLowerCase().includes(q) ?? false,
    );
    return matching.length > 0 ? [{ po, lines: matching, itemMatch: true }] : [];
  });

  // ── Direct receipts: one row per item, matched on item, vendor, invoice,
  // receipt number or who added it.
  const directRows = directReceipts.flatMap((receipt) =>
    receipt.orders.map((line) => ({ receipt, line, log: line.receiving_logs[0] ?? null })),
  );
  const visibleDirectRows = q
    ? directRows.filter(({ receipt, line, log }) =>
        [
          one(line.items)?.name,
          one(receipt.shopkeepers)?.name,
          log?.invoice_number,
          receipt.po_number,
          one(receipt.profiles)?.full_name,
        ].some((v) => v?.toLowerCase().includes(q)),
      )
    : directRows;

  const tabs = [
    { key: "open", label: "Open orders", count: purchaseOrders.length, href: base },
    { key: "direct", label: "Direct receipts", count: directRows.length, href: directHref },
  ];

  function renderItem(order: OpenOrderRow, orderDate: string) {
    const item = one(order.items);
    const received = receivedTotalByOrder.get(order.id) ?? 0;
    const orderLogs = logsByOrder.get(order.id) ?? [];
    const remaining = order.quantity_ordered - received;
    const isOver = remaining < 0;
    const editCount = orderLogs.reduce((n, l) => n + l.receiving_edit_log.length, 0);

    // Each edit stored the values from before it; what it changed them to
    // is the next edit's "before", or the delivery as it stands now.
    const edits = orderLogs
      .flatMap((log) => {
        const sorted = [...log.receiving_edit_log].sort((a, b) =>
          a.edited_at.localeCompare(b.edited_at),
        );
        const current: DeliveryValues = {
          quantity_received: log.quantity_received,
          received_date: log.received_date,
          invoice_number: log.invoice_number,
          condition_notes: log.condition_notes,
        };
        return sorted.map((edit, i) => ({
          edit,
          log,
          before: edit.previous_values ?? {},
          after: (sorted[i + 1]?.previous_values ?? current) as Partial<DeliveryValues>,
        }));
      })
      .sort((a, b) => b.edit.edited_at.localeCompare(a.edit.edited_at));

    const show = (key: keyof DeliveryValues, v: unknown) => {
      if (v === null || v === undefined || v === "") return "—";
      if (key === "quantity_received") return `${formatQty(Number(v))} ${order.unit}`;
      if (key === "received_date") return formatDate(String(v));
      return String(v);
    };
    const same = (key: keyof DeliveryValues, a: unknown, b: unknown) =>
      key === "quantity_received"
        ? Number(a) === Number(b)
        : key === "received_date"
          ? indiaDay(String(a)) === indiaDay(String(b))
          : (a ?? "") === (b ?? "");

    const history = (
      <ul className="divide-y divide-brand-border-soft text-[13px] text-[#4b5563]">
        {orderLogs.map((log) => {
          const receiver = one(log.profiles);
          return (
            <EditableRow
              key={log.id}
              version={`${log.quantity_received}|${log.received_date}|${log.invoice_number}|${log.condition_notes}`}
              summary={
                <div className="grid items-center gap-x-4 gap-y-0.5 sm:grid-cols-[90px_100px_110px_140px_minmax(0,1fr)_auto]">
                  <span className="font-bold text-brand-navy">
                    {formatQty(log.quantity_received)} {order.unit}
                  </span>
                  <span>{formatDate(log.received_date)}</span>
                  <span>{log.invoice_number ? `Inv ${log.invoice_number}` : "—"}</span>
                  <span className="text-[#7b8494]">by {receiver?.full_name ?? "Unknown"}</span>
                  <span className="break-words italic text-[#7b8494]">
                    {log.condition_notes && `“${log.condition_notes}”`}
                  </span>
                  {log.receiving_edit_log.length > 0 ? (
                    <span className="justify-self-start rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                      Edited
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              }
              editForm={
                canEditLog(log) ? (
                  <form
                    action={editReceiving}
                    className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-brand-border-soft bg-brand-cream p-3"
                  >
                    <input type="hidden" name="receiving_log_id" value={log.id} />
                    <div className="w-40">
                      <Field
                        label="Quantity"
                        id={`rq-${log.id}`}
                        name="quantity_received"
                        type="number"
                        step="0.01"
                        min="0.01"
                        defaultValue={log.quantity_received}
                        suffix={order.unit}
                        required
                      />
                    </div>
                    <div className="w-44">
                      <Field
                        label="Received date"
                        id={`rd-${log.id}`}
                        name="received_date"
                        type="date"
                        defaultValue={indiaDay(log.received_date)}
                        min={orderDate}
                        max={today}
                        required
                      />
                    </div>
                    <div className="w-40">
                      <Field
                        label="Invoice"
                        id={`ri-${log.id}`}
                        name="invoice_number"
                        defaultValue={log.invoice_number ?? ""}
                        required
                      />
                    </div>
                    <div className="w-48">
                      <Field
                        label="Notes"
                        id={`rn-${log.id}`}
                        name="condition_notes"
                        defaultValue={log.condition_notes ?? ""}
                      />
                    </div>
                    <div className="w-56">
                      <Field
                        label="Reason (optional)"
                        id={`rr-${log.id}`}
                        name="note"
                        placeholder="e.g. wrong quantity typed"
                      />
                    </div>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </form>
                ) : undefined
              }
            />
          );
        })}
        {orderLogs.length === 0 && (
          <li className="py-2 text-[#7b8494]">No deliveries logged yet.</li>
        )}
      </ul>
    );

    const editsList = (
      <div className="flex flex-col gap-3">
        {edits.map(({ edit, log, before, after }) => {
          const editor = one(edit.profiles)?.full_name ?? "Unknown";
          const changed = EDIT_FIELDS.filter(
            (f) => f.key in before && !same(f.key, before[f.key], after[f.key]),
          );
          return (
            <div key={edit.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy text-[10px] font-bold text-brand-gold-light">
                    {initials(editor)}
                  </span>
                  <span className="font-bold text-brand-navy">{editor}</span>
                  <span className="text-[#7b8494]">edited on {formatDateTime(edit.edited_at)}</span>
                </div>
                <span className="text-xs text-[#7b8494]">
                  Delivery: {formatQty(log.quantity_received)} {order.unit} ·{" "}
                  {formatDate(log.received_date)}
                </span>
              </div>
              {changed.length > 0 ? (
                <div className="mt-2 grid grid-cols-[110px_minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[13px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a836f]">
                    Field
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a836f]">
                    Before
                  </span>
                  <span />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a836f]">
                    After
                  </span>
                  {changed.map((f) => (
                    <div key={f.key} className="contents">
                      <span className="text-brand-navy">{f.label}</span>
                      <span className="break-words rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-red-700 line-through">
                        {show(f.key, before[f.key])}
                      </span>
                      <span className="text-[#7b8494]">→</span>
                      <span className="break-words rounded-md border border-green-200 bg-green-50 px-2 py-0.5 font-bold text-green-800">
                        {show(f.key, after[f.key])}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#7b8494]">Saved with no changes.</p>
              )}
              {edit.note && (
                <p className="mt-2 text-xs text-[#4b5563]">Reason: “{edit.note}”</p>
              )}
            </div>
          );
        })}
      </div>
    );

    const itemTabs = [
      ...(canReceiveHere
        ? [
            {
              key: "receive",
              label: "Receive",
              content: (
                <LogReceivingForm
                  orderId={order.id}
                  itemUnit={order.unit}
                  orderDate={orderDate}
                  remainingQuantity={remaining}
                />
              ),
            },
          ]
        : []),
      { key: "history", label: `History (${orderLogs.length})`, content: history },
      ...(edits.length > 0
        ? [{ key: "edits", label: `Edits (${edits.length})`, content: editsList }]
        : []),
    ];

    return (
      <ReceivingItemCard
        key={order.id}
        name={item?.name ?? "Unknown item"}
        unit={order.unit}
        description={order.description}
        // Rounded down until it's all in, so 19,992 / 20,000 doesn't read 100%.
        percent={(remaining > 0 ? Math.floor : Math.round)((received / order.quantity_ordered) * 100)}
        received={formatQty(received)}
        ordered={formatQty(order.quantity_ordered)}
        remainingLabel={
          isOver
            ? `▲ ${formatQty(-remaining)} ${order.unit} over`
            : remaining === 0
              ? "✓ Fully received"
              : `${formatQty(remaining)} ${order.unit} left`
        }
        isOver={isOver}
        deliveryCount={orderLogs.length}
        editCount={editCount}
        dimmed={remaining <= 0}
        tabs={itemTabs}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Receiving</h1>
          <p className="text-[#6b7280]">
            Log deliveries against open orders — partial deliveries are fine, and extra quantity is allowed but flagged.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {sites.length > 1 && (
            <SiteSwitcher basePath="/receiving" sites={sites} selectedSiteId={selectedSiteId} />
          )}
          {canReceiveHere && (
            <Link
              href={`${directHref}&new=1`}
              className="rounded-full bg-brand-navy px-5 py-2.5 text-sm font-bold text-brand-gold-text shadow-[0_6px_14px_-6px_rgba(15,26,51,0.5)] hover:bg-brand-navy-2"
            >
              + Direct Receipt
            </Link>
          )}
        </div>
      </div>

      {!canReceiveHere && (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Receiving (HO2) users can log
          deliveries.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-brand-border-soft">
        <div className="flex gap-1">
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold ${
                  isActive
                    ? "border-brand-gold text-brand-navy"
                    : "border-transparent text-[#6b7280] hover:text-brand-navy"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 text-[11px] font-bold ${
                    isActive
                      ? "bg-brand-navy text-white"
                      : "border border-brand-border-soft text-[#6b7280]"
                  }`}
                >
                  {t.count}
                </span>
              </Link>
            );
          })}
        </div>
        <div className="mb-2 w-full sm:w-80">
          <OrderSearchBox
            key={tab}
            basePath="/receiving"
            siteId={selectedSiteId}
            defaultValue={qParam ?? ""}
            extraParams={tab === "direct" ? { tab: "direct", ...(newParam ? { new: "1" } : {}) } : {}}
            placeholder={tab === "direct" ? "Search item, vendor, invoice…" : "Search PO, vendor or item…"}
          />
        </div>
      </div>

      {tab === "open" ? (
        <section className="rounded-2xl border border-brand-border bg-white shadow-sm">
          <div className="hidden items-center gap-2 rounded-t-2xl border-b border-brand-border-soft bg-brand-cream px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] md:flex">
            <span className="w-7 shrink-0" />
            <div className={`${PO_GRID} flex-1`}>
              <div>PO</div>
              <div>Vendor</div>
              <div>Items</div>
              <div>Received</div>
              <div>Placed</div>
            </div>
            <span className="w-8 shrink-0" />
          </div>

          <div className="divide-y divide-brand-border-soft">
            {visiblePos.map(({ po, lines, itemMatch }, index) => {
              const shopkeeper = one(po.shopkeepers);
              const placedByProfile = one(po.profiles);
              const orderDate = indiaDay(po.placed_date);
              const allLines = linesByPo.get(po.id) ?? [];
              const progress =
                allLines.length === 0
                  ? 0
                  : (allLines.reduce(
                      (sum, l) =>
                        sum + Math.min(1, (receivedTotalByOrder.get(l.id) ?? 0) / l.quantity_ordered),
                      0,
                    ) /
                      allLines.length) *
                    100;
              const anyOver = allLines.some(
                (l) => (receivedTotalByOrder.get(l.id) ?? 0) > l.quantity_ordered,
              );

              return (
                <ActionRow
                  key={po.id}
                  defaultExpanded={itemMatch || (!q && index === 0)}
                  className="data-[expanded=true]:bg-brand-cream/60"
                  rowClassName="px-4 py-3"
                  summary={
                    <div className={`${PO_GRID} items-center gap-y-1.5`}>
                      <p className="font-mono text-[13px] font-bold text-brand-navy [overflow-wrap:anywhere]">
                        {po.po_number}
                      </p>
                      <p className="text-sm font-bold text-brand-navy">
                        {shopkeeper?.name ?? "Unknown vendor"}
                      </p>
                      <p className="text-sm text-[#4b5563]">
                        <span className="md:hidden">Items: </span>
                        {allLines.length}
                      </p>
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#efebe2]">
                          <div
                            className={`h-full rounded-full ${
                              anyOver
                                ? "bg-red-500"
                                : progress >= 100
                                  ? "bg-status-completed"
                                  : "bg-status-pending"
                            }`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs font-bold text-[#4b5563]">
                          {Math.floor(progress)}%
                        </span>
                      </div>
                      <div>
                        <p className="text-[13px] text-brand-navy">{formatDate(po.placed_date)}</p>
                        <p className="text-[11px] text-[#7b8494]">
                          {placedByProfile?.full_name ?? "Unknown"}
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="flex flex-col gap-2 border-t border-brand-border-soft px-4 py-3 md:pl-[52px] md:pr-14">
                    {lines.map((order) => renderItem(order, orderDate))}
                    {itemMatch && lines.length < allLines.length && (
                      <p className="text-xs text-[#7b8494]">
                        Showing {lines.length} of {allLines.length} items matching “{qParam}”.
                      </p>
                    )}
                  </div>
                </ActionRow>
              );
            })}

            {purchaseOrders.length === 0 && (
              <p className="p-8 text-center text-[#7b8494]">No open orders at this site right now.</p>
            )}
            {purchaseOrders.length > 0 && visiblePos.length === 0 && (
              <p className="p-8 text-center text-[#7b8494]">No open orders match “{qParam}”.</p>
            )}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          {canReceiveHere && newParam && (
            <DirectReceiptForm
              siteId={selectedSiteId}
              items={(itemsData ?? []) as { id: string; name: string; unit: string }[]}
              shopkeepers={(shopkeepersData ?? []) as { id: string; name: string }[]}
              closeHref={qParam ? `${directHref}&q=${encodeURIComponent(qParam)}` : directHref}
            />
          )}

          <section className="rounded-2xl border border-brand-border bg-white shadow-sm">
            <div className="hidden items-center gap-2 rounded-t-2xl border-b border-brand-border-soft bg-brand-cream px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] md:flex">
              <span className="w-7 shrink-0" />
              <div className={`${DIRECT_GRID} flex-1`}>
                <div>Item</div>
                <div>Vendor</div>
                <div>Qty</div>
                <div>Date</div>
                <div>Added by</div>
                <div>Status</div>
              </div>
              <span className="w-8 shrink-0" />
            </div>

            <div className="divide-y divide-brand-border-soft">
              {visibleDirectRows.map(({ receipt, line, log }) => {
                const status = DIRECT_STATUS[line.status];
                const rejection = line.order_edit_log.find((l) => l.action === "rejected");
                return (
                  <ActionRow
                    key={line.id}
                    className="data-[expanded=true]:bg-brand-cream/60"
                    rowClassName="px-4 py-2.5"
                    summary={
                      <div className={`${DIRECT_GRID} items-center gap-y-1`}>
                        <div className="min-w-0">
                          <p className="break-words text-sm font-bold text-brand-navy">
                            {one(line.items)?.name ?? "Unknown item"}
                          </p>
                          <p className="font-mono text-[11px] text-[#7b8494]">{receipt.po_number}</p>
                        </div>
                        <p className="text-[13px] text-[#4b5563]">
                          {one(receipt.shopkeepers)?.name ?? "No vendor"}
                        </p>
                        <p className="text-sm font-bold text-brand-navy">
                          {formatQty(line.quantity_ordered)} {line.unit}
                        </p>
                        <p className="text-[13px] text-[#4b5563]">{formatDate(receipt.placed_date)}</p>
                        <p className="text-[13px] text-[#4b5563]">
                          {one(receipt.profiles)?.full_name ?? "Unknown"}
                        </p>
                        <span
                          className={`justify-self-start whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    }
                  >
                    <div className="flex flex-col gap-1 px-4 pb-3 text-[13px] text-[#4b5563] md:pl-[52px]">
                      <p className="flex flex-wrap gap-x-6">
                        <span>
                          <span className="text-[#7b8494]">Invoice</span>{" "}
                          {log?.invoice_number ?? "—"}
                        </span>
                        <span>
                          <span className="text-[#7b8494]">Receipt</span> {receipt.po_number}
                          {receipt.orders.length > 1 && ` (${receipt.orders.length} items)`}
                        </span>
                      </p>
                      {log?.condition_notes && (
                        <p className="break-words italic text-[#7b8494]">“{log.condition_notes}”</p>
                      )}
                      {rejection?.note && (
                        <p className="text-red-700">Rejected: {rejection.note}</p>
                      )}
                    </div>
                  </ActionRow>
                );
              })}

              {directRows.length === 0 && (
                <p className="p-8 text-center text-[#7b8494]">No direct receipts at this site yet.</p>
              )}
              {directRows.length > 0 && visibleDirectRows.length === 0 && (
                <p className="p-8 text-center text-[#7b8494]">No direct receipts match “{qParam}”.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
