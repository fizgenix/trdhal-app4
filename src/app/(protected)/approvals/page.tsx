import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { lineDisplayStatus, StatusBadge } from "@/components/StatusBadge";
import { ApprovalActions } from "./ApprovalActions";
import { ActionRow } from "../orders/ActionRow";
import { OrderSearchBox } from "../orders/OrderSearchBox";
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
  /** Optional note entered with the line on the Orders tab. */
  description: string | null;
  items: Rel<{ name: string }>;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string;
  /** 'direct' = misc items logged by HO2 with no PO (0016_direct_receipts.sql). */
  kind: "po" | "direct";
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

/** "2,31,232" — Indian digit grouping, up to 2 decimals. */
function formatQty(n: number) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Columns: ID, item, qty to approve, logged by, then remarks + action (one form). */
const ROW_GRID =
  "grid gap-x-4 gap-y-2 md:grid-cols-[210px_minmax(0,1.6fr)_100px_140px_minmax(0,1fr)_210px]";

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
  searchParams: Promise<{ site?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, q: qParam } = await searchParams;
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
      .select("id, purchase_order_id, quantity_ordered, unit, description, status, items ( name )")
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
      .select("id, po_number, kind, placed_date, shopkeepers ( name ), profiles ( full_name ), orders!inner ( status )")
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

  // POs first (newest first), then direct receipts — each MISC receipt is
  // its own "PO", so they're grouped by vendor instead.
  const regularPos = purchaseOrders.filter((po) => po.kind === "po");
  const directByVendor = new Map<string, PurchaseOrderRow[]>();
  for (const po of purchaseOrders.filter((p) => p.kind === "direct")) {
    const vendor = one(po.shopkeepers)?.name ?? "No vendor";
    directByVendor.set(vendor, [...(directByVendor.get(vendor) ?? []), po]);
  }
  const groups = [
    ...regularPos.map((po) => ({ key: po.id, direct: false, pos: [po] })),
    ...Array.from(directByVendor, ([vendor, pos]) => ({ key: `direct-${vendor}`, direct: true, pos })),
  ];

  // Search matches a PO's number or vendor (showing all its items), or
  // else an item, receipt number, invoice or who logged it (showing just
  // the matching items).
  const q = (qParam ?? "").trim().toLowerCase();
  const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(q);
  const visibleGroups = groups.flatMap((group) => {
    const lines = group.pos.flatMap((po) =>
      (linesByPo.get(po.id) ?? []).map((order) => ({ po, order })),
    );
    if (!q) return [{ ...group, lines }];
    const first = group.pos[0];
    if ((!group.direct && has(first.po_number)) || has(one(first.shopkeepers)?.name)) {
      return [{ ...group, lines }];
    }
    const matching = lines.filter(
      ({ po, order }) =>
        has(one(order.items)?.name) ||
        has(po.po_number) ||
        (logsByOrder.get(order.id) ?? []).some(
          (l) => has(l.invoice_number) || has(one(l.profiles)?.full_name),
        ),
    );
    return matching.length > 0 ? [{ ...group, lines: matching }] : [];
  });

  function renderLine(po: PurchaseOrderRow, order: PendingOrderRow) {
    const isDirect = po.kind === "direct";
    const item = one(order.items);
    const orderLogs = logsByOrder.get(order.id) ?? [];
    const lastLog = orderLogs[orderLogs.length - 1];
    const invoices = Array.from(new Set(orderLogs.map((l) => l.invoice_number).filter(Boolean)));
    const receivedTotal = receivedTotalByOrder.get(order.id) ?? 0;
    const isFullyReceived = receivedTotal >= order.quantity_ordered;
    const overBy = receivedTotal - order.quantity_ordered;
    const approvedTotal = approvedTotalByOrder.get(order.id) ?? 0;
    const orderApprovals = approvalsByOrder.get(order.id) ?? [];
    // Received but not yet approved — what the Approve button covers.
    const toApprove = Number((receivedTotal - approvedTotal).toFixed(4));
    const shortBy = order.quantity_ordered - receivedTotal;
    const notes = orderLogs.map((l) => l.condition_notes).filter(Boolean);

    return (
      <div
        key={order.id}
        className={`${ROW_GRID} items-center px-4 py-3 ${overBy > 0 ? "bg-red-50/60" : ""}`}
      >
        <p className="font-mono text-xs font-bold text-brand-navy [overflow-wrap:anywhere] md:whitespace-nowrap md:[overflow-wrap:normal]">
          {po.po_number}
        </p>

        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-brand-navy">
            {item?.name ?? "Unknown item"}{" "}
            <span className="font-normal text-[#7b8494]">({order.unit})</span>
          </p>
          {order.description && (
            <p className="break-words text-xs text-[#7b8494]">{order.description}</p>
          )}
          <p className="text-xs text-[#6b7280]">
            {isDirect
              ? `Received: ${formatQty(receivedTotal)} ${order.unit} (no PO)`
              : `${formatQty(receivedTotal)} of ${formatQty(order.quantity_ordered)} ${order.unit} received${
                  shortBy > 0 ? ` · ${formatQty(shortBy)} still due` : ""
                }`}
          </p>
          {overBy > 0 && (
            <p className="text-xs font-bold text-red-700">
              ▲ Over-received by {formatQty(overBy)} {order.unit} — check with the site and vendor
              before approving, and note the outcome in the remarks.
            </p>
          )}
          {orderApprovals.length > 0 && (
            <p
              className="text-xs text-green-700"
              title={orderApprovals
                .map(
                  (a) =>
                    `${formatQty(a.quantity_approved)} ${order.unit} by ${one(a.profiles)?.full_name ?? "Unknown"} on ${formatDate(a.approved_date)}`,
                )
                .join("\n")}
            >
              {formatQty(approvedTotal)} {order.unit} approved already
            </p>
          )}
          {notes.length > 0 && (
            <p className="break-words text-xs italic text-[#7b8494]">
              {notes.map((n) => `“${n}”`).join(" · ")}
            </p>
          )}
        </div>

        <p className="text-sm font-bold text-brand-navy">
          <span className="font-normal text-[#7b8494] md:hidden">To approve: </span>
          {toApprove > 0 ? `${formatQty(toApprove)} ${order.unit}` : "—"}
        </p>

        <div className="text-[13px]">
          {lastLog ? (
            <>
              <p className="text-brand-navy">{one(lastLog.profiles)?.full_name ?? "Unknown"}</p>
              <p className="text-[11px] text-[#7b8494]">
                {formatDate(lastLog.received_date)}
                {orderLogs.length > 1 && ` · ${orderLogs.length} deliveries`}
              </p>
              {invoices.length > 0 && (
                <p className="text-[11px] text-[#7b8494]">Inv {invoices.join(", ")}</p>
              )}
            </>
          ) : (
            <p className="text-[#7b8494]">No deliveries yet</p>
          )}
        </div>

        {canApproveHere ? (
          <ApprovalActions
            orderId={order.id}
            canApprove={toApprove > 0}
            canReject={isDirect && toApprove > 0}
            closeShortLabel={
              !isFullyReceived ? `Close short at ${formatQty(receivedTotal)} ${order.unit}` : undefined
            }
            waitingLabel={`Waiting on ${formatQty(shortBy)} ${order.unit}`}
          />
        ) : (
          <div className="col-span-full flex justify-end md:col-span-2">
            <StatusBadge status={lineDisplayStatus(order.status, approvedTotal)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Approvals</h1>
          <p className="text-[#6b7280]">
            Approve deliveries as they come in, or close an item short if the rest
            isn&apos;t coming.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pendingOrders.length > 0 && (
            <span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-[13px] font-bold text-orange-800">
              {pendingOrders.length} waiting for approval
            </span>
          )}
          {sites.length > 1 && (
            <SiteSwitcher basePath="/approvals" sites={sites} selectedSiteId={selectedSiteId} />
          )}
        </div>
      </div>

      {!canApproveHere && (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Accounts (HO3) users can approve
          orders.
        </p>
      )}

      {pendingOrders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
          No orders are waiting on approval at this site right now.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#7b8494]">
              Grouped by purchase order. Direct receipts have no PO and are grouped by vendor.
            </p>
            <div className="w-full sm:w-80">
              <OrderSearchBox
                basePath="/approvals"
                siteId={selectedSiteId}
                defaultValue={qParam ?? ""}
                placeholder="Search PO, vendor, item or invoice…"
              />
            </div>
          </div>

          {visibleGroups.map((group, index) => {
            const first = group.pos[0];
            const shopkeeper = one(first.shopkeepers);
            return (
              <ActionRow
                key={group.key}
                // Only the first card opens by default — all of them while
                // searching, since the results are already narrowed down.
                defaultExpanded={index === 0 || !!q}
                className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm"
                rowClassName="bg-brand-content px-4 py-2.5"
                summary={
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {group.direct ? (
                      <>
                        <span className="rounded-full border border-purple-300 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                          Direct receipt
                        </span>
                        <span className="text-sm font-bold text-brand-navy">
                          {shopkeeper?.name ?? "No vendor"}
                        </span>
                        <span className="text-xs text-[#7b8494]">No PO · logged on site</span>
                      </>
                    ) : (
                      <>
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                          Purchase order
                        </span>
                        <span className="text-sm font-bold text-brand-navy">
                          {first.po_number} · {shopkeeper?.name ?? "Unknown vendor"}
                        </span>
                        <span className="text-xs text-[#7b8494]">
                          Placed by {one(first.profiles)?.full_name ?? "Unknown"} on{" "}
                          {formatDate(first.placed_date)}
                        </span>
                      </>
                    )}
                    <span className="ml-auto rounded-full border border-brand-border-soft bg-white px-2 py-0.5 text-[11px] font-bold text-[#4b5563]">
                      {group.lines.length} item{group.lines.length === 1 ? "" : "s"}
                    </span>
                  </div>
                }
              >
                <div
                  className={`${ROW_GRID} hidden border-y border-brand-border-soft px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] md:grid`}
                >
                  <div>ID</div>
                  <div>Item</div>
                  <div>Qty</div>
                  <div>Logged by</div>
                  <div>Remarks</div>
                  <div className="text-right">{canApproveHere ? "Action" : "Status"}</div>
                </div>
                <div className="divide-y divide-brand-border-soft border-t border-brand-border-soft md:border-t-0">
                  {group.lines.map(({ po, order }) => renderLine(po, order))}
                </div>
              </ActionRow>
            );
          })}

          {visibleGroups.length === 0 && (
            <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
              Nothing waiting on approval matches “{qParam}”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
