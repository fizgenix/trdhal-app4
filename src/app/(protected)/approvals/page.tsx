import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { lineDisplayStatus, StatusBadge } from "@/components/StatusBadge";
import { ApproveOrderForm } from "./ApproveOrderForm";
import { OverReceivedBadge } from "@/components/OverReceivedBadge";
import type { OrderStatus } from "@/types/database";

type Rel<T> = T | T[] | null;

/** One PO line waiting on approval — each line is approved on its own. */
type PendingOrderRow = {
  id: string;
  purchase_order_id: string;
  quantity_ordered: number;
  status: OrderStatus;
  /** The line's own unit — receiving and approval stay in it. */
  unit: string;
  items: Rel<{ name: string }>;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  placed_date: string;
  shopkeepers: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

type ApprovalRow = {
  id: string;
  order_id: string;
  quantity_approved: number;
  remarks: string | null;
  approved_date: string;
  profiles: Rel<{ full_name: string }>;
};

type ReceivingLogRow = {
  id: string;
  order_id: string;
  quantity_received: number;
  condition_notes: string | null;
  invoice_number: string | null;
  received_date: string;
  profiles: Rel<{ full_name: string }>;
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

export default async function ApprovalsPage({
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
        review approvals.
      </div>
    );
  }

  const selectedSiteId = await resolveSelectedSiteId(sites, siteParam);

  const canApproveHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho3_accounts",
    );

  const OPEN_STATUSES = ["pending_approval"];

  // One parallel batch: logs and POs are filtered by site and status
  // through their order lines (`orders!inner`) instead of by a list of
  // ids, so nothing waits on the order list first — each extra wait is a
  // full round trip to the database.
  const [{ data: ordersData }, { data: logsData }, { data: posData }, { data: approvalsData }] = await Promise.all([
    // Lines oldest-first, so they list in the order entered on the PO.
    supabase
      .from("orders")
      .select("id, purchase_order_id, quantity_ordered, unit, status, items ( name )")
      .eq("site_id", selectedSiteId)
      .in("status", OPEN_STATUSES)
      .order("created_at"),
    supabase
      .from("receiving_logs")
      .select(
        "id, order_id, quantity_received, condition_notes, invoice_number, received_date, profiles ( full_name ), orders!inner ( site_id, status )",
      )
      .eq("orders.site_id", selectedSiteId)
      .in("orders.status", OPEN_STATUSES)
      .order("received_date", { ascending: true }),
    supabase
      .from("purchase_orders")
      .select("id, po_number, placed_date, shopkeepers ( name ), profiles ( full_name ), orders!inner ( status )")
      .eq("site_id", selectedSiteId)
      .in("orders.status", OPEN_STATUSES)
      .order("placed_date", { ascending: false }),
    supabase
      .from("approvals")
      .select(
        "id, order_id, quantity_approved, remarks, approved_date, profiles ( full_name ), orders!inner ( site_id, status )",
      )
      .eq("orders.site_id", selectedSiteId)
      .in("orders.status", OPEN_STATUSES)
      .order("approved_date", { ascending: true }),
  ]);

  const pendingOrders = (ordersData ?? []) as unknown as PendingOrderRow[];

  // Earlier partial approvals on each line — what's approved so far.
  const approvalsByOrder = new Map<string, ApprovalRow[]>();
  const approvedTotalByOrder = new Map<string, number>();
  for (const approval of (approvalsData ?? []) as unknown as ApprovalRow[]) {
    const list = approvalsByOrder.get(approval.order_id) ?? [];
    list.push(approval);
    approvalsByOrder.set(approval.order_id, list);
    approvedTotalByOrder.set(
      approval.order_id,
      (approvedTotalByOrder.get(approval.order_id) ?? 0) + Number(approval.quantity_approved),
    );
  }

  // Pending lines grouped under their PO, newest PO first.
  const purchaseOrders = (posData ?? []) as unknown as PurchaseOrderRow[];
  const linesByPo = new Map<string, PendingOrderRow[]>();
  for (const order of pendingOrders) {
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
          <h1 className="text-2xl font-extrabold text-brand-navy">Approvals</h1>
          <p className="text-[#6b7280]">
            Approve deliveries as they come in, or close an item short if the rest
            isn&apos;t coming.
          </p>
        </div>
        {sites.length > 1 && (
          <SiteSwitcher basePath="/approvals" sites={sites} selectedSiteId={selectedSiteId} />
        )}
      </div>

      {!canApproveHere && (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Accounts (HO3) users can approve
          orders.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {purchaseOrders.map((po) => {
          const shopkeeper = one(po.shopkeepers);
          const placedByProfile = one(po.profiles);

          return (
            <section key={po.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
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

              {(linesByPo.get(po.id) ?? []).map((order) => {
                const item = one(order.items);
                const orderLogs = logsByOrder.get(order.id) ?? [];
                const receivedTotal = receivedTotalByOrder.get(order.id) ?? 0;
                const isFullyReceived = receivedTotal >= order.quantity_ordered;
                const overBy = receivedTotal - order.quantity_ordered;
                const approvedTotal = approvedTotalByOrder.get(order.id) ?? 0;
                const orderApprovals = approvalsByOrder.get(order.id) ?? [];
                // Received but not yet approved — what the Approve button covers.
                const toApprove = Number((receivedTotal - approvedTotal).toFixed(4));
                const shortBy = order.quantity_ordered - receivedTotal;

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl border border-brand-border bg-white p-5 shadow-sm ${
                      overBy > 0
                        ? "border-2 border-red-400"
                        : toApprove > 0
                          ? ""
                          : "border-dashed bg-[#fbfaf6]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-bold text-brand-navy">
                            {item?.name ?? "Unknown item"}{" "}
                            <span className="text-xs font-normal text-[#7b8494]">({order.unit})</span>
                          </p>
                          <OverReceivedBadge
                            ordered={order.quantity_ordered}
                            received={receivedTotal}
                            unit={order.unit}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-[#6b7280]">
                          Ordered: {order.quantity_ordered} {order.unit} · Received:{" "}
                          {receivedTotal} {order.unit} · Approved: {approvedTotal} {order.unit}
                        </p>
                      </div>
                      <StatusBadge status={lineDisplayStatus(order.status, approvedTotal)} />
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efebe2]">
                      <div
                        className={`h-full ${overBy > 0 ? "bg-red-500" : isFullyReceived ? "bg-status-completed" : "bg-status-pending"}`}
                        style={{
                          width: `${Math.min(100, (receivedTotal / order.quantity_ordered) * 100)}%`,
                        }}
                      />
                    </div>

                    <div className="mt-4 border-t border-brand-border-soft pt-4">
                      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
                        Delivery log ({orderLogs.length})
                      </p>
                      {orderLogs.length === 0 ? (
                        <p className="text-sm text-[#7b8494]">No deliveries logged yet.</p>
                      ) : (
                        <ul className="space-y-1 text-sm text-[#4b5563]">
                          {orderLogs.map((log) => {
                            const receiver = one(log.profiles);
                            return (
                              <li key={log.id}>
                                {log.quantity_received} {order.unit} on {formatDate(log.received_date)}{" "}
                                — logged by {receiver?.full_name ?? "Unknown"}
                                {log.invoice_number && (
                                  <span className="text-[#7b8494]"> · Invoice {log.invoice_number}</span>
                                )}
                                {log.condition_notes && (
                                  <span className="text-[#7b8494]"> · &quot;{log.condition_notes}&quot;</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {orderApprovals.length > 0 && (
                        <>
                          <p className="mb-2 mt-4 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
                            Approved so far ({orderApprovals.length})
                          </p>
                          <ul className="space-y-1 text-sm text-[#4b5563]">
                            {orderApprovals.map((approval) => (
                              <li key={approval.id}>
                                {approval.quantity_approved} {order.unit} on{" "}
                                {formatDate(approval.approved_date)} — approved by{" "}
                                {one(approval.profiles)?.full_name ?? "Unknown"}
                                {approval.remarks && (
                                  <span className="text-[#7b8494]"> · &quot;{approval.remarks}&quot;</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    {overBy > 0 && (
                      <p className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                        ▲ Over-received: {receivedTotal} {order.unit} delivered against{" "}
                        {order.quantity_ordered} {order.unit} ordered (+
                        {Number(overBy.toFixed(2))} {order.unit}). Check with the site and vendor
                        before approving — note the outcome in the remarks.
                      </p>
                    )}

                    {canApproveHere && (
                      <div className="mt-4 flex flex-col gap-3 border-t border-brand-border-soft pt-4">
                        {toApprove > 0 ? (
                          <ApproveOrderForm
                            orderId={order.id}
                            label={
                              isFullyReceived
                                ? `Approve ${toApprove} ${order.unit} & complete`
                                : `Approve ${toApprove} ${order.unit} received`
                            }
                          />
                        ) : (
                          <p className="rounded-lg bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                            Everything received so far is approved — waiting on the remaining{" "}
                            {Number(shortBy.toFixed(2))} {order.unit} to be delivered.
                          </p>
                        )}

                        {!isFullyReceived && toApprove > 0 && (
                          <p className="text-xs text-[#7b8494]">
                            Approving now keeps this item open for the remaining{" "}
                            {Number(shortBy.toFixed(2))} {order.unit}.
                          </p>
                        )}

                        {!isFullyReceived && (
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-red-600">
                              Not expecting the rest? Close short at {receivedTotal} {order.unit}
                            </summary>
                            <div className="mt-3 flex flex-col gap-3">
                              <p className="text-xs text-[#6b7280]">
                                Accepts {receivedTotal} of {order.quantity_ordered} {order.unit} as
                                final and completes this item — short by{" "}
                                {Number(shortBy.toFixed(2))} {order.unit}. No more deliveries can be
                                logged against it.
                              </p>
                              <ApproveOrderForm
                                orderId={order.id}
                                closeShort
                                label="Close short & complete"
                                remarksPlaceholder="e.g. vendor out of stock, balance cancelled"
                              />
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        {pendingOrders.length === 0 && (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No orders are waiting on approval at this site right now.
          </p>
        )}
      </div>
    </div>
  );
}
