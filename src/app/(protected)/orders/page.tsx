import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { lineDisplayStatus, StatusBadge } from "@/components/StatusBadge";
import { OverReceivedBadge } from "@/components/OverReceivedBadge";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { NewOrderForm } from "./NewOrderForm";
import { OrderSearchBox } from "./OrderSearchBox";
import { AddLineForm } from "./AddLineForm";
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
  searchParams: Promise<{ site?: string; status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, status: statusParam, q: qParam } = await searchParams;
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
      .order("placed_date", { ascending: false }),
    // Oldest first: lines list in the order they were entered on the PO.
    supabase
      .from("orders")
      .select(
        "id, purchase_order_id, item_id, quantity_ordered, unit, status, placed_by, items ( name )",
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-brand-border bg-white p-1">
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
                className={`rounded-full px-4 py-2 text-[13px] font-bold ${
                  isActive
                    ? "bg-brand-navy text-white"
                    : "text-[#4b5563] hover:bg-brand-content"
                }`}
              >
                {tab.label}{" "}
                <span
                  className={`font-semibold ${isActive ? "text-brand-gold-light" : "font-normal text-[#7b8494]"}`}
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

      <div className="flex flex-col gap-4">
        {visiblePos.map((po) => {
          const shopkeeper = one(po.shopkeepers);
          const placedByProfile = one(po.profiles);
          const poLines = linesByPo.get(po.id) ?? [];
          const poStatus = statusByPo.get(po.id) ?? "placed";
          const isOwner = user.isAdmin || po.placed_by === user.id;
          const activeLineCount = poLines.filter((l) => l.status !== "cancelled").length;
          const poLogs = editLogsByPo.get(po.id) ?? [];
          const invoiceNumbers = Array.from(invoiceNumbersByPo.get(po.id) ?? []);

          return (
            <div
              key={po.id}
              className="rounded-2xl border border-brand-border bg-white p-[18px] shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-brand-border bg-brand-cream px-2.5 py-0.5 font-mono text-[13px] font-bold text-brand-navy">
                      {po.po_number}
                    </span>
                    <p className="text-[15px] font-bold text-brand-navy">
                      {shopkeeper?.name ?? "Unknown vendor"}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#7b8494]">
                    {activeLineCount} item{activeLineCount === 1 ? "" : "s"} · Placed by{" "}
                    {placedByProfile?.full_name ?? "Unknown"} on {formatDate(po.placed_date)}
                  </p>
                  {invoiceNumbers.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-[#7b8494]">
                      Invoice{invoiceNumbers.length > 1 ? "s" : ""}:{" "}
                      {invoiceNumbers.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {overReceivedPos.has(po.id) && (
                    <span className="rounded-full border border-red-300 bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">
                      ▲ Over-received
                    </span>
                  )}
                  <StatusBadge status={poStatus} />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-brand-border-soft">
                <div className="hidden grid-cols-[minmax(0,1.6fr)_0.7fr_0.7fr_1fr_auto] gap-3 bg-brand-cream px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] sm:grid">
                  <div>Item</div>
                  <div>Ordered</div>
                  <div>Received</div>
                  <div>Progress</div>
                  <div className="w-[230px] text-right">Status</div>
                </div>
                <div className="divide-y divide-brand-border-soft">
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

                    return (
                      <div key={line.id} className={`px-4 py-3 ${isRemoved ? "opacity-60" : ""}`}>
                        <div className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1.6fr)_0.7fr_0.7fr_1fr_auto]">
                          <p
                            className={`text-sm font-bold text-brand-navy ${isRemoved ? "line-through" : ""}`}
                          >
                            {item?.name ?? "Unknown item"}{" "}
                            <span className="text-xs font-normal text-[#7b8494]">
                              ({line.unit})
                            </span>
                          </p>
                          <p className="text-xs text-[#6b7280]">
                            <span className="sm:hidden">Ordered: </span>
                            {line.quantity_ordered} {line.unit}
                          </p>
                          <p className="text-xs text-[#6b7280]">
                            <span className="sm:hidden">Received: </span>
                            {received} {line.unit}
                          </p>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#efebe2]">
                            {!isRemoved && (
                              <div
                                className={`h-full ${
                                  received > line.quantity_ordered
                                    ? "bg-red-500"
                                    : received >= line.quantity_ordered
                                    ? "bg-status-completed"
                                    : "bg-status-pending"
                                }`}
                                style={{
                                  width: `${Math.min(100, (received / line.quantity_ordered) * 100)}%`,
                                }}
                              />
                            )}
                          </div>
                          <div className="sm:w-[230px] sm:text-right">
                            {isRemoved ? (
                              <span className="text-xs font-bold text-[#7b8494]">Removed</span>
                            ) : (
                              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <OverReceivedBadge
                                  ordered={line.quantity_ordered}
                                  received={received}
                                  unit={line.unit}
                                />
                                {shortClosed && (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                    <span aria-hidden>▼</span>
                                    Short-closed −
                                    {Number((line.quantity_ordered - received).toFixed(2))} {line.unit}
                                  </span>
                                )}
                                <StatusBadge status={lineDisplayStatus(line.status, approved)} />
                              </span>
                            )}
                          </div>
                        </div>

                        {lineApprovals.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-[11px] text-green-800">
                            {lineApprovals.map((approval) => (
                              <li
                                key={approval.id}
                                className={approval.closes_short ? "text-amber-800" : ""}
                              >
                                {approval.closes_short ? "Closed short" : "Approved"}{" "}
                                {approval.quantity_approved} {line.unit} by{" "}
                                {one(approval.profiles)?.full_name ?? "Unknown"} on{" "}
                                {formatDate(approval.approved_date)}
                                {approval.remarks && ` — "${approval.remarks}"`}
                              </li>
                            ))}
                          </ul>
                        )}

                        {canManageLine && (
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-brand-navy">
                                Edit quantity
                              </summary>
                              <form action={editOrder} className="mt-3 flex flex-wrap items-end gap-3">
                                <input type="hidden" name="order_id" value={line.id} />
                                <div className="w-40">
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
                            </details>

                            {activeLineCount > 1 && (
                              <details>
                                <summary className="cursor-pointer text-xs font-semibold text-red-600">
                                  Remove item
                                </summary>
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
                                  <SubmitButton
                                    variant="danger"
                                    pendingText="Removing… please wait"
                                  >
                                    Remove this item
                                  </SubmitButton>
                                </form>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isOwner && (poStatus === "placed" || poStatus === "pending_approval") && (
                <div className="mt-4 flex flex-col gap-2 border-t border-brand-border-soft pt-4">
                  {canOrderHere && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-brand-navy">
                        + Add an item to this PO
                      </summary>
                      <AddLineForm purchaseOrderId={po.id} items={itemsWithUsualUnit} />
                    </details>
                  )}

                  {poStatus === "placed" && (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-red-600">
                        Cancel PO
                      </summary>
                      <form
                        action={cancelPurchaseOrder}
                        className="mt-3 flex flex-wrap items-end gap-3"
                      >
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
                    </details>
                  )}
                </div>
              )}

              {poLogs.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[#7b8494]">
                    History ({poLogs.length})
                  </summary>
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
                </details>
              )}
            </div>
          );
        })}

        {purchaseOrders.length === 0 && (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No orders placed at this site yet.
          </p>
        )}
        {purchaseOrders.length > 0 && visiblePos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            {qParam
              ? `No orders match "${qParam}"${statusParam && statusParam !== "all" ? " in this filter" : ""}.`
              : "No orders match this filter."}
          </p>
        )}
      </div>
    </div>
  );
}
