import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { lineDisplayStatus, StatusBadge } from "@/components/StatusBadge";
import { OverReceivedBadge } from "@/components/OverReceivedBadge";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { paginate, Pagination } from "@/components/ui/Pagination";
import { NewOrderForm } from "./NewOrderForm";
import { OrderSearchBox } from "./OrderSearchBox";
import { AddLineForm } from "./AddLineForm";
import { ActionRow, type RowAction } from "./ActionRow";
import { editOrder, removeOrderLine, cancelPurchaseOrder } from "./actions";
import type { OrderStatus } from "@/types/database";

/** "over" isn't a status — it lists POs with any over-received line. */
const STATUS_TABS: { value: OrderStatus | "all" | "over"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "completed", label: "Completed" },
  { value: "over", label: "Over-received" },
];

type ItemRow = { id: string; name: string; unit: string };
type ShopkeeperRow = { id: string; name: string };

type Rel<T> = T | T[] | null;

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  placed_date: string;
  placed_by: string;
  shopkeepers: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

/** One item line of a PO. */
type OrderLineRow = {
  id: string;
  purchase_order_id: string;
  item_id: string;
  quantity_ordered: number;
  /** The line's own unit — receiving and approval stay in it. */
  unit: string;
  /** Optional note entered with the line (size, brand, spec). */
  description: string | null;
  status: OrderStatus;
  placed_by: string;
  items: Rel<{ name: string }>;
};

type EditLogJoinRow = {
  id: string;
  order_id: string;
  action: "edited" | "cancelled" | "added" | "removed";
  note: string | null;
  edited_at: string;
  profiles: Rel<{ full_name: string }>;
};

type ReceivingLogRow = {
  order_id: string;
  quantity_received: number;
  invoice_number: string | null;
};

type ApprovalJoinRow = {
  id: string;
  order_id: string;
  approved_date: string;
  remarks: string | null;
  quantity_approved: number;
  closes_short: boolean;
  profiles: Rel<{ full_name: string }>;
};

const EDIT_ACTION_LABELS: Record<EditLogJoinRow["action"], string> = {
  edited: "Quantity edited",
  cancelled: "Cancelled",
  added: "Item added",
  removed: "Item removed",
};

function one<T>(rel: Rel<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** "2,31,232" — Indian digit grouping, up to 2 decimals. */
function formatQty(n: number) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Columns of a PO row: PO, vendor, items, progress, placed, status. */
const PO_GRID =
  "grid gap-x-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.8fr)_44px_minmax(0,1.1fr)_minmax(0,0.9fr)_150px]";

function ProgressBar({ percent, tone }: { percent: number; tone: "over" | "done" | "partial" }) {
  const color =
    tone === "over" ? "bg-red-500" : tone === "done" ? "bg-status-completed" : "bg-status-pending";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#efebe2]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * A PO's status, derived from its lines (removed lines don't count):
 * nothing received yet → Placed; every line approved → Completed; every
 * line removed → Cancelled; anything in between → Pending Approval.
 */
function purchaseOrderStatus(lines: OrderLineRow[]): OrderStatus {
  const active = lines.filter((l) => l.status !== "cancelled");
  if (active.length === 0) return "cancelled";
  if (active.every((l) => l.status === "completed")) return "completed";
  if (active.every((l) => l.status === "placed")) return "placed";
  return "pending_approval";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; status?: string; q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, status: statusParam, q: qParam, page: pageParam } = await searchParams;
  const supabase = await createClient();

  const sites = user.sites;

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
        You&apos;re not assigned to a site yet — ask your Admin to add you before you can
        see orders.
      </div>
    );
  }

  const selectedSiteId = await resolveSelectedSiteId(sites, siteParam);

  const canOrderHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho1_ordering",
    );

  // Everything the page needs, in one parallel batch. The history tables
  // are filtered by site through their order (`orders!inner`) rather than
  // by a list of order ids, so they don't have to wait for the order list
  // first — each extra wait is a full round trip to the database.
  const [
    { data: items },
    { data: shopkeepers },
    { data: posData },
    { data: linesData },
    { data: editLogsData },
    { data: receivingLogsData },
    { data: approvalsData },
  ] = await Promise.all([
    supabase.from("items").select("id, name, unit").order("name"),
    supabase.from("shopkeepers").select("id, name").order("name"),
    supabase
      .from("purchase_orders")
      .select("id, po_number, placed_date, placed_by, shopkeepers ( name ), profiles ( full_name )")
      .eq("site_id", selectedSiteId)
      // Direct receipts (MISC-, no PO) are HO2's — shown on Receiving / Approvals.
      .eq("kind", "po")
      .order("placed_date", { ascending: false }),
    // Oldest first: lines list in the order they were entered on the PO.
    supabase
      .from("orders")
      .select(
        "id, purchase_order_id, item_id, quantity_ordered, unit, description, status, placed_by, items ( name )",
      )
      .eq("site_id", selectedSiteId)
      .order("created_at"),
    supabase
      .from("order_edit_log")
      .select("id, order_id, action, note, edited_at, profiles ( full_name ), orders!inner ( site_id )")
      .eq("orders.site_id", selectedSiteId)
      .order("edited_at", { ascending: false }),
    supabase
      .from("receiving_logs")
      .select("order_id, quantity_received, invoice_number, orders!inner ( site_id )")
      .eq("orders.site_id", selectedSiteId),
    supabase
      .from("approvals")
      .select(
        "id, order_id, approved_date, remarks, quantity_approved, closes_short, profiles ( full_name ), orders!inner ( site_id )",
      )
      .eq("orders.site_id", selectedSiteId)
      .order("approved_date"),
  ]);

  const purchaseOrders = (posData ?? []) as unknown as PurchaseOrderRow[];
  const lines = (linesData ?? []) as unknown as OrderLineRow[];

  const linesByPo = new Map<string, OrderLineRow[]>();
  // Pre-fill a new line's unit with the one this item was last ordered in
  // at this site (lines are oldest-first, so the last write wins), falling
  // back to the item's own.
  const lastUnitByItem = new Map<string, string>();
  for (const line of lines) {
    const list = linesByPo.get(line.purchase_order_id) ?? [];
    list.push(line);
    linesByPo.set(line.purchase_order_id, list);
    lastUnitByItem.set(line.item_id, line.unit);
  }
  const itemsWithUsualUnit = ((items ?? []) as ItemRow[]).map((item) => ({
    ...item,
    unit: lastUnitByItem.get(item.id) ?? item.unit,
  }));

  const lineById = new Map(lines.map((l) => [l.id, l]));

  // Edit history is logged per line; shown per PO, newest first.
  const editLogsByPo = new Map<string, EditLogJoinRow[]>();
  for (const log of (editLogsData ?? []) as unknown as EditLogJoinRow[]) {
    const poId = lineById.get(log.order_id)?.purchase_order_id;
    if (!poId) continue;
    const list = editLogsByPo.get(poId) ?? [];
    list.push(log);
    editLogsByPo.set(poId, list);
  }

  // "Order stays visible with full history (ordered vs. received vs.
  // approved) even after completion" — pull the received total per line
  // (and each delivery's invoice number per PO) so that history shows
  // here too, not just on the Receiving page.
  const receivedTotalByLine = new Map<string, number>();
  const invoiceNumbersByPo = new Map<string, Set<string>>();
  for (const row of (receivingLogsData ?? []) as unknown as ReceivingLogRow[]) {
    receivedTotalByLine.set(
      row.order_id,
      (receivedTotalByLine.get(row.order_id) ?? 0) + Number(row.quantity_received),
    );
    const poId = lineById.get(row.order_id)?.purchase_order_id;
    if (row.invoice_number && poId) {
      const set = invoiceNumbersByPo.get(poId) ?? new Set<string>();
      set.add(row.invoice_number);
      invoiceNumbersByPo.set(poId, set);
    }
  }

  // A line can be approved in several batches (0014_partial_approvals.sql).
  const approvalsByLine = new Map<string, ApprovalJoinRow[]>();
  for (const approval of (approvalsData ?? []) as unknown as ApprovalJoinRow[]) {
    const list = approvalsByLine.get(approval.order_id) ?? [];
    list.push(approval);
    approvalsByLine.set(approval.order_id, list);
  }

  // POs with any line delivered beyond its ordered quantity — flagged on
  // the card and listed under their own tab so the order team spots them.
  const overReceivedPos = new Set(
    lines
      .filter((l) => (receivedTotalByLine.get(l.id) ?? 0) > l.quantity_ordered)
      .map((l) => l.purchase_order_id),
  );

  const statusByPo = new Map(
    purchaseOrders.map((po) => [po.id, purchaseOrderStatus(linesByPo.get(po.id) ?? [])]),
  );

  // Search matches the PO number, vendor name or any item on the PO —
  // applied on top of (not instead of) the status tab filter below.
  const q = (qParam ?? "").trim().toLowerCase();
  const searchFiltered = q
    ? purchaseOrders.filter((po) => {
        const shopkeeper = one(po.shopkeepers);
        return (
          po.po_number.toLowerCase().includes(q) ||
          (shopkeeper?.name.toLowerCase().includes(q) ?? false) ||
          (linesByPo.get(po.id) ?? []).some(
            (l) => one(l.items)?.name.toLowerCase().includes(q) ?? false,
          )
        );
      })
    : purchaseOrders;

  const visiblePos = searchFiltered.filter(
    (po) =>
      !statusParam ||
      statusParam === "all" ||
      (statusParam === "over" ? overReceivedPos.has(po.id) : statusByPo.get(po.id) === statusParam),
  );
  // 50 POs per page, after search and the status tab.
  const posPage = paginate(visiblePos, pageParam);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Orders</h1>
          <p className="text-[#6b7280]">Placed → Received → Approved, tracked per site.</p>
        </div>
        {sites.length > 1 && (
          <SiteSwitcher basePath="/orders" sites={sites} selectedSiteId={selectedSiteId} />
        )}
      </div>

      {canOrderHere ? (
        <NewOrderForm
          siteId={selectedSiteId}
          items={itemsWithUsualUnit}
          shopkeepers={(shopkeepers ?? []) as ShopkeeperRow[]}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Ordering (HO1) users can place new
          orders.
        </p>
      )}

      <section className="rounded-2xl border border-brand-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border-soft p-3">
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((tab) => {
              const count =
                tab.value === "all"
                  ? searchFiltered.length
                  : tab.value === "over"
                    ? searchFiltered.filter((po) => overReceivedPos.has(po.id)).length
                    : searchFiltered.filter((po) => statusByPo.get(po.id) === tab.value).length;
              const isActive = (statusParam ?? "all") === tab.value;
              const qSuffix = qParam ? `&q=${encodeURIComponent(qParam)}` : "";
              return (
                <Link
                  key={tab.value}
                  href={`/orders?site=${selectedSiteId}${tab.value === "all" ? "" : `&status=${tab.value}`}${qSuffix}`}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-bold ${
                    isActive ? "bg-brand-navy text-white" : "text-[#4b5563] hover:bg-brand-content"
                  }`}
                >
                  {tab.label}{" "}
                  <span
                    className={isActive ? "font-semibold text-brand-gold-light" : "font-normal text-[#7b8494]"}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          <OrderSearchBox
            basePath="/orders"
            siteId={selectedSiteId}
            status={statusParam}
            defaultValue={qParam ?? ""}
          />
        </div>

        {/* Column names — same toggle / cells / menu layout as ActionRow. */}
        <div className="hidden items-center gap-2 border-b border-brand-border-soft bg-brand-cream px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] md:flex">
          <span className="w-7 shrink-0" />
          <div className={`${PO_GRID} flex-1`}>
            <div>PO</div>
            <div>Vendor</div>
            <div>Items</div>
            <div>Progress</div>
            <div>Placed</div>
            <div className="text-right">Status</div>
          </div>
          <span className="w-8 shrink-0" />
        </div>

        <div className="divide-y divide-brand-border-soft">
          {posPage.pageRows.map((po) => {
            const shopkeeper = one(po.shopkeepers);
            const placedByProfile = one(po.profiles);
            const poLines = linesByPo.get(po.id) ?? [];
            const activeLines = poLines.filter((l) => l.status !== "cancelled");
            const poStatus = statusByPo.get(po.id) ?? "placed";
            const isOwner = user.isAdmin || po.placed_by === user.id;
            const activeLineCount = activeLines.length;
            const poLogs = editLogsByPo.get(po.id) ?? [];
            const invoiceNumbers = Array.from(invoiceNumbersByPo.get(po.id) ?? []);
            const isOverReceived = overReceivedPos.has(po.id);

            // Mean of each line's own progress (lines can be in different
            // units, so their quantities can't simply be summed).
            const progress =
              activeLines.length === 0
                ? 0
                : (activeLines.reduce(
                    (sum, l) =>
                      sum + Math.min(1, (receivedTotalByLine.get(l.id) ?? 0) / l.quantity_ordered),
                    0,
                  ) /
                    activeLines.length) *
                  100;

            const poIsOpen = poStatus === "placed" || poStatus === "pending_approval";
            const poActions: RowAction[] = [];
            if (isOwner && poIsOpen && canOrderHere) {
              poActions.push({
                key: "add",
                label: "+ Add item to PO",
                panel: <AddLineForm purchaseOrderId={po.id} items={itemsWithUsualUnit} />,
              });
            }
            if (poLogs.length > 0) {
              poActions.push({
                key: "history",
                label: `History (${poLogs.length})`,
                panel: (
                  <ul className="mt-2 space-y-1 text-xs text-[#6b7280]">
                    {poLogs.map((log) => {
                      const editor = one(log.profiles);
                      const itemName = one(lineById.get(log.order_id)?.items ?? null)?.name;
                      return (
                        <li key={log.id}>
                          {EDIT_ACTION_LABELS[log.action]}
                          {itemName && log.action !== "cancelled" && ` (${itemName})`} by{" "}
                          {editor?.full_name ?? "Unknown"} on {formatDate(log.edited_at)}
                          {log.note && ` — "${log.note}"`}
                        </li>
                      );
                    })}
                  </ul>
                ),
              });
            }
            if (isOwner && poStatus === "placed") {
              poActions.push({
                key: "cancel",
                label: "Cancel PO",
                tone: "danger",
                panel: (
                  <form action={cancelPurchaseOrder} className="mt-3 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="purchase_order_id" value={po.id} />
                    <div className="w-64">
                      <Field
                        label="Reason (optional)"
                        id={`cancel-note-${po.id}`}
                        name="note"
                        placeholder="e.g. wrong vendor"
                      />
                    </div>
                    <SubmitButton variant="danger" pendingText="Cancelling… please wait">
                      Cancel this PO
                    </SubmitButton>
                  </form>
                ),
              });
            }

            // A search that matched an item opens the PO to show it.
            const matchesItem =
              !!q && poLines.some((l) => one(l.items)?.name.toLowerCase().includes(q) ?? false);

            return (
              <ActionRow
                key={po.id}
                defaultExpanded={matchesItem}
                version={`${poStatus}|${activeLineCount}|${poLogs.length}`}
                actions={poActions}
                className="data-[expanded=true]:bg-brand-cream/60"
                rowClassName="px-4 py-3"
                summary={
                  <div className={`${PO_GRID} items-center gap-y-1.5`}>
                    <p className="break-words font-mono text-[13px] font-bold text-brand-navy [overflow-wrap:anywhere]">
                      {po.po_number}
                    </p>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-brand-navy">
                        {shopkeeper?.name ?? "Unknown vendor"}
                      </p>
                      {invoiceNumbers.length > 0 && (
                        <p className="text-[11px] text-[#7b8494]">
                          Invoice{invoiceNumbers.length > 1 ? "s" : ""}: {invoiceNumbers.join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-[#4b5563]">
                      <span className="md:hidden">Items: </span>
                      {activeLineCount}
                    </p>
                    <div className="flex items-center gap-2.5">
                      <ProgressBar
                        percent={progress}
                        tone={isOverReceived ? "over" : progress >= 100 ? "done" : "partial"}
                      />
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
                    <div className="flex flex-wrap items-center gap-1.5 md:flex-col md:items-end">
                      {isOverReceived && (
                        <span className="rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                          ▲ Over-received
                        </span>
                      )}
                      <StatusBadge status={poStatus} />
                    </div>
                  </div>
                }
              >
                <div className="divide-y divide-brand-border-soft border-t border-brand-border-soft bg-brand-cream/60">
                  {poLines.map((line) => {
                    const item = one(line.items);
                    const received = receivedTotalByLine.get(line.id) ?? 0;
                    const lineApprovals = approvalsByLine.get(line.id) ?? [];
                    const approved = lineApprovals.reduce(
                      (sum, a) => sum + Number(a.quantity_approved),
                      0,
                    );
                    const shortClosed = lineApprovals.some((a) => a.closes_short);
                    const isRemoved = line.status === "cancelled";
                    const canManageLine = line.status === "placed" && isOwner;

                    const lineActions: RowAction[] = [];
                    if (canManageLine) {
                      lineActions.push({
                        key: "edit",
                        label: "Edit quantity",
                        panel: (
                          <form action={editOrder} className="mt-3 flex flex-wrap items-end gap-3">
                            <input type="hidden" name="order_id" value={line.id} />
                            <div className="w-52">
                              <Field
                                label="New quantity"
                                id={`qty-${line.id}`}
                                name="quantity_ordered"
                                type="number"
                                step="0.01"
                                min="0.01"
                                defaultValue={line.quantity_ordered}
                                suffix={line.unit}
                                required
                              />
                            </div>
                            <div className="w-64">
                              <Field
                                label="Reason (optional)"
                                id={`edit-note-${line.id}`}
                                name="note"
                                placeholder="e.g. corrected typo"
                              />
                            </div>
                            <SubmitButton variant="secondary">Save</SubmitButton>
                          </form>
                        ),
                      });
                      if (activeLineCount > 1) {
                        lineActions.push({
                          key: "remove",
                          label: "Remove item",
                          tone: "danger",
                          panel: (
                            <form
                              action={removeOrderLine}
                              className="mt-3 flex flex-wrap items-end gap-3"
                            >
                              <input type="hidden" name="order_id" value={line.id} />
                              <div className="w-64">
                                <Field
                                  label="Reason (optional)"
                                  id={`remove-note-${line.id}`}
                                  name="note"
                                  placeholder="e.g. not needed any more"
                                />
                              </div>
                              <SubmitButton variant="danger" pendingText="Removing… please wait">
                                Remove this item
                              </SubmitButton>
                            </form>
                          ),
                        });
                      }
                    }

                    return (
                      <ActionRow
                        key={line.id}
                        version={`${line.quantity_ordered}|${line.status}`}
                        actions={lineActions}
                        className={isRemoved ? "opacity-60" : ""}
                        rowClassName="py-3 pl-4 pr-4 md:pl-[52px]"
                        summary={
                          <div className="grid items-center gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_170px_130px_minmax(130px,auto)]">
                            <div className="min-w-0">
                              <p
                                className={`break-words text-sm font-bold text-brand-navy ${isRemoved ? "line-through" : ""}`}
                              >
                                {item?.name ?? "Unknown item"}{" "}
                                <span className="font-normal text-[#7b8494]">({line.unit})</span>
                              </p>
                              {line.description && (
                                <p className="text-xs text-[#7b8494]">{line.description}</p>
                              )}
                              {lineApprovals.map((approval) => (
                                <p
                                  key={approval.id}
                                  className={`text-[11px] ${approval.closes_short ? "text-amber-800" : "text-green-700"}`}
                                >
                                  {approval.closes_short ? "Closed short" : "Approved"}{" "}
                                  {formatQty(approval.quantity_approved)} {line.unit} by{" "}
                                  {one(approval.profiles)?.full_name ?? "Unknown"} on{" "}
                                  {formatDate(approval.approved_date)}
                                  {approval.remarks && ` — "${approval.remarks}"`}
                                </p>
                              ))}
                            </div>
                            <p className="text-[13px] text-[#4b5563] md:text-right">
                              {formatQty(received)} {line.unit} / {formatQty(line.quantity_ordered)}{" "}
                              {line.unit}
                            </p>
                            {isRemoved ? (
                              <span className="hidden md:block" />
                            ) : (
                              <ProgressBar
                                percent={(received / line.quantity_ordered) * 100}
                                tone={
                                  received > line.quantity_ordered
                                    ? "over"
                                    : received >= line.quantity_ordered
                                      ? "done"
                                      : "partial"
                                }
                              />
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                              {isRemoved ? (
                                <span className="text-xs font-bold text-[#7b8494]">Removed</span>
                              ) : (
                                <>
                                  <OverReceivedBadge
                                    ordered={line.quantity_ordered}
                                    received={received}
                                    unit={line.unit}
                                  />
                                  {shortClosed && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                      <span aria-hidden>▼</span>
                                      Short-closed −
                                      {Number((line.quantity_ordered - received).toFixed(2))}{" "}
                                      {line.unit}
                                    </span>
                                  )}
                                  <StatusBadge status={lineDisplayStatus(line.status, approved)} />
                                </>
                              )}
                            </div>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </ActionRow>
            );
          })}

          {purchaseOrders.length === 0 && (
            <p className="p-8 text-center text-[#7b8494]">No orders placed at this site yet.</p>
          )}
          {purchaseOrders.length > 0 && visiblePos.length === 0 && (
            <p className="p-8 text-center text-[#7b8494]">
              {qParam
                ? `No orders match "${qParam}"${statusParam && statusParam !== "all" ? " in this filter" : ""}.`
                : "No orders match this filter."}
            </p>
          )}
        </div>

        {posPage.pageCount > 1 ? (
          <Pagination
            href={`/orders?site=${selectedSiteId}${statusParam && statusParam !== "all" ? `&status=${statusParam}` : ""}${qParam ? `&q=${encodeURIComponent(qParam)}` : ""}`}
            page={posPage.page}
            total={posPage.total}
            className="rounded-b-2xl border-t border-brand-border-soft"
          />
        ) : purchaseOrders.length > 0 && (
          <p className="rounded-b-2xl border-t border-brand-border-soft px-4 py-2.5 text-xs text-[#7b8494]">
            Showing {visiblePos.length} of {purchaseOrders.length} order
            {purchaseOrders.length === 1 ? "" : "s"}
          </p>
        )}
      </section>
    </div>
  );
}
