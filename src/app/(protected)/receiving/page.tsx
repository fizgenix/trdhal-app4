import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { StatusBadge } from "@/components/StatusBadge";
import { LogReceivingForm } from "./LogReceivingForm";
import { RECEIVING_COLUMNS } from "./columns";
import { DirectReceiptForm } from "./DirectReceiptForm";
import { editReceiving } from "./actions";
import { OverReceivedBadge } from "@/components/OverReceivedBadge";
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
  }[];
};

const DIRECT_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  placed: { label: "Pending", className: "bg-orange-100 text-orange-800" },
  pending_approval: { label: "Pending approval", className: "bg-orange-100 text-orange-800" },
  completed: { label: "Approved", className: "bg-green-100 text-green-800" },
  cancelled: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

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
  receiving_edit_log: { edited_at: string; note: string | null; profiles: Rel<{ full_name: string }> }[];
};

type ApprovalTimeRow = { order_id: string; created_at: string };

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

export default async function ReceivingPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam } = await searchParams;
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
        "id, order_id, quantity_received, condition_notes, invoice_number, received_date, received_by, created_at, profiles ( full_name ), receiving_edit_log ( edited_at, note, profiles ( full_name ) ), orders!inner ( site_id, status )",
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
        "id, po_number, placed_date, shopkeepers ( name ), profiles ( full_name ), orders ( id, quantity_ordered, unit, status, items ( name ), order_edit_log ( action, note ) )",
      )
      .eq("site_id", selectedSiteId)
      .eq("kind", "direct")
      .order("placed_date", { ascending: false })
      .limit(15),
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Receiving</h1>
          <p className="text-[#6b7280]">
            Log deliveries against open orders — partial deliveries are fine, and extra quantity is allowed but flagged.
          </p>
        </div>
        {sites.length > 1 && (
          <SiteSwitcher basePath="/receiving" sites={sites} selectedSiteId={selectedSiteId} />
        )}
      </div>

      {!canReceiveHere && (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Receiving (HO2) users can log
          deliveries.
        </p>
      )}

      {canReceiveHere && (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-dashed border-brand-navy px-4 py-2 text-sm font-bold text-brand-navy hover:bg-brand-cream">
            <span className="group-open:hidden">+ Direct Receipt</span>
            <span className="hidden group-open:inline">− Hide Direct Receipt</span>
          </summary>
          <div className="mt-4">
            <DirectReceiptForm
              siteId={selectedSiteId}
              items={(itemsData ?? []) as { id: string; name: string; unit: string }[]}
              shopkeepers={(shopkeepersData ?? []) as { id: string; name: string }[]}
            />
          </div>
        </details>
      )}

      {openOrders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
          No open orders at this site right now.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
          {canReceiveHere && (
            <div className={`hidden ${RECEIVING_COLUMNS} gap-2.5 border-b border-brand-border bg-brand-cream px-5 py-3 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] sm:grid`}>
              <div />
              <div>ITEM</div>
              <div>RECEIVED / ORDERED</div>
              <div>QTY</div>
              <div>DATE</div>
              <div>INVOICE</div>
              <div>NOTES</div>
              <div />
            </div>
          )}

          <div className="divide-y divide-brand-border">
            {purchaseOrders.map((po) => {
              const shopkeeper = one(po.shopkeepers);
              const placedByProfile = one(po.profiles);
              const orderDate = indiaDay(po.placed_date);

              return (
                <div key={po.id}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#fbfaf6] px-5 py-2.5">
                    <span className="rounded-full border border-brand-border bg-brand-cream px-2.5 py-0.5 font-mono text-[12px] font-bold text-brand-navy">
                      {po.po_number}
                    </span>
                    <span className="text-sm font-bold text-brand-navy">
                      {shopkeeper?.name ?? "Unknown vendor"}
                    </span>
                    <span className="text-xs text-[#7b8494]">
                      Placed by {placedByProfile?.full_name ?? "Unknown"} on{" "}
                      {formatDate(po.placed_date)}
                    </span>
                  </div>

                  <div className="divide-y divide-brand-border-soft">
                    {(linesByPo.get(po.id) ?? []).map((order) => {
                      const item = one(order.items);
                      const receivedSoFar = receivedTotalByOrder.get(order.id) ?? 0;
                      const orderLogs = logsByOrder.get(order.id) ?? [];

                      return (
                        <div key={order.id} className="px-1 py-2 sm:px-0 sm:py-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:hidden">
                            <p className="min-w-0 flex-1 break-words text-sm font-bold text-brand-navy">
                              {item?.name ?? "Unknown item"}
                              {order.description && (
                                <span className="block text-xs font-normal text-[#7b8494]">
                                  {order.description}
                                </span>
                              )}
                            </p>
                            <StatusBadge status={order.status} />
                          </div>

                          {canReceiveHere ? (
                            <LogReceivingForm
                              orderId={order.id}
                              itemName={item?.name ?? "Unknown item"}
                              itemUnit={order.unit}
                              description={order.description}
                              orderDate={orderDate}
                              quantityOrdered={order.quantity_ordered}
                              receivedSoFar={receivedSoFar}
                              remainingQuantity={order.quantity_ordered - receivedSoFar}
                            />
                          ) : (
                            <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                              <span className="min-w-0 break-words font-bold text-brand-navy">
                                {item?.name ?? "Unknown item"}{" "}
                                <span className="font-normal text-[#7b8494]">({order.unit})</span>
                                {order.description && (
                                  <span className="block text-xs font-normal text-[#7b8494]">
                                    {order.description}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-[#6b7280]">
                                <OverReceivedBadge
                                  ordered={order.quantity_ordered}
                                  received={receivedSoFar}
                                  unit={order.unit}
                                />
                                {receivedSoFar} / {order.quantity_ordered}
                              </span>
                            </div>
                          )}

                          {orderLogs.length > 0 && (
                            <div className="px-5 pb-3">
                              <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
                                Receiving history ({orderLogs.length})
                              </p>
                              <ul className="mt-1 divide-y divide-brand-border-soft text-xs text-[#4b5563]">
                                {orderLogs.map((log) => {
                                  const receiver = one(log.profiles);
                                  const lastEdit = [...log.receiving_edit_log].sort((a, b) =>
                                    b.edited_at.localeCompare(a.edited_at),
                                  )[0];
                                  return (
                                    <li key={log.id} className="py-1.5">
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                        <span className="font-bold text-brand-navy">
                                          {log.quantity_received} {order.unit}
                                        </span>
                                        <span>{formatDate(log.received_date)}</span>
                                        {log.invoice_number && <span>Invoice {log.invoice_number}</span>}
                                        <span className="text-[#7b8494]">
                                          by {receiver?.full_name ?? "Unknown"}
                                        </span>
                                        {lastEdit && (
                                          <span
                                            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800"
                                            title={lastEdit.note ? `Reason: ${lastEdit.note}` : undefined}
                                          >
                                            Edited by {one(lastEdit.profiles)?.full_name ?? "Unknown"} on{" "}
                                            {formatDate(lastEdit.edited_at)}
                                          </span>
                                        )}
                                      </div>
                                      {log.condition_notes && (
                                        <p className="mt-0.5 break-words text-[#7b8494]">
                                          &quot;{log.condition_notes}&quot;
                                        </p>
                                      )}
                                      {canEditLog(log) && (
                                        <details className="mt-1">
                                          <summary className="cursor-pointer text-xs font-semibold text-brand-navy">
                                            Edit
                                          </summary>
                                          <form
                                            action={editReceiving}
                                            className="mt-2 flex flex-wrap items-end gap-3"
                                          >
                                            <input type="hidden" name="receiving_log_id" value={log.id} />
                                            <div className="w-36">
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
                                        </details>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {directReceipts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold text-brand-navy">Recent Direct Receipts</h2>
          <div className="divide-y divide-brand-border overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
            {directReceipts.map((receipt) => (
              <div key={receipt.id} className="flex flex-col gap-2 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-full border border-brand-border bg-brand-cream px-2.5 py-0.5 font-mono text-[12px] font-bold text-brand-navy">
                    {receipt.po_number}
                  </span>
                  <span className="text-sm font-bold text-brand-navy">
                    {one(receipt.shopkeepers)?.name ?? "No vendor"}
                  </span>
                  <span className="text-xs text-[#7b8494]">
                    Logged by {one(receipt.profiles)?.full_name ?? "Unknown"} on{" "}
                    {formatDate(receipt.placed_date)}
                  </span>
                </div>
                <ul className="flex flex-col gap-1 text-sm text-[#4b5563]">
                  {receipt.orders.map((line) => {
                    const status = DIRECT_STATUS[line.status];
                    const rejection = line.order_edit_log.find((l) => l.action === "rejected");
                    return (
                      <li key={line.id} className="flex flex-wrap items-center gap-2">
                        <span>
                          {one(line.items)?.name ?? "Unknown item"} — {line.quantity_ordered}{" "}
                          {line.unit}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}>
                          {status.label}
                        </span>
                        {rejection?.note && (
                          <span className="text-xs text-red-700">Reason: {rejection.note}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
