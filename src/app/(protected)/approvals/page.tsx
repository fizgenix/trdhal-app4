import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { StatusBadge } from "@/components/StatusBadge";
import { ApproveOrderForm } from "./ApproveOrderForm";
import type { OrderStatus } from "@/types/database";

type Rel<T> = T | T[] | null;

type PendingOrderRow = {
  id: string;
  po_number: string;
  quantity_ordered: number;
  status: OrderStatus;
  placed_date: string;
  items: Rel<{ name: string; unit: string }>;
  shopkeepers: Rel<{ name: string }>;
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

  let sites: { id: string; name: string }[] = [];
  if (user.isAdmin) {
    const { data } = await supabase.from("sites").select("id, name").order("name");
    sites = data ?? [];
  } else {
    const map = new Map<string, string>();
    user.siteAssignments.forEach((a) => map.set(a.site_id, a.site_name));
    sites = Array.from(map, ([id, name]) => ({ id, name }));
  }

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
        You&apos;re not assigned to a site yet — ask your Admin to add you before you can
        review approvals.
      </div>
    );
  }

  const selectedSiteId =
    siteParam && sites.some((s) => s.id === siteParam) ? siteParam : sites[0].id;

  const canApproveHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho3_accounts",
    );

  const { data: ordersData } = await supabase
    .from("orders")
    .select(
      "id, po_number, quantity_ordered, status, placed_date, items ( name, unit ), shopkeepers ( name ), profiles ( full_name )",
    )
    .eq("site_id", selectedSiteId)
    .eq("status", "pending_approval")
    .order("placed_date", { ascending: false });

  const pendingOrders = (ordersData ?? []) as unknown as PendingOrderRow[];
  const orderIds = pendingOrders.map((o) => o.id);

  const { data: logsData } =
    orderIds.length > 0
      ? await supabase
          .from("receiving_logs")
          .select(
            "id, order_id, quantity_received, condition_notes, invoice_number, received_date, profiles ( full_name )",
          )
          .in("order_id", orderIds)
          .order("received_date", { ascending: true })
      : { data: [] as ReceivingLogRow[] };

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
            Review the receiving log against what was ordered, then approve to close the
            order out.
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
        {pendingOrders.map((order) => {
          const item = one(order.items);
          const shopkeeper = one(order.shopkeepers);
          const placedByProfile = one(order.profiles);
          const orderLogs = logsByOrder.get(order.id) ?? [];
          const receivedTotal = receivedTotalByOrder.get(order.id) ?? 0;
          const isFullyReceived = receivedTotal >= order.quantity_ordered;

          return (
            <div
              key={order.id}
              className={`rounded-2xl border border-brand-border bg-white p-5 shadow-sm ${
                isFullyReceived ? "" : "border-dashed bg-[#fbfaf6] opacity-80"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-brand-navy">
                      {item?.name ?? "Unknown item"}{" "}
                      <span className="text-xs font-normal text-[#7b8494]">
                        ({item?.unit})
                      </span>
                    </p>
                    <span className="rounded-full border border-brand-border bg-brand-cream px-2 py-0.5 font-mono text-[11px] font-bold text-brand-navy">
                      {order.po_number}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    Ordered: {order.quantity_ordered} {item?.unit} · Received:{" "}
                    {receivedTotal} {item?.unit} · Shopkeeper: {shopkeeper?.name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#7b8494]">
                    Placed by {placedByProfile?.full_name ?? "Unknown"} on{" "}
                    {formatDate(order.placed_date)}
                  </p>
                </div>
                {isFullyReceived ? (
                  <StatusBadge status={order.status} />
                ) : (
                  <span className="shrink-0 rounded-full bg-[#d3cbb9] px-3.5 py-1.5 text-xs font-bold text-[#4b5563]">
                    Waiting on {order.quantity_ordered - receivedTotal} of{" "}
                    {order.quantity_ordered}
                  </span>
                )}
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efebe2]">
                <div
                  className={`h-full ${isFullyReceived ? "bg-status-completed" : "bg-status-pending"}`}
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
                          {log.quantity_received} {item?.unit} on {formatDate(log.received_date)}{" "}
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
              </div>

              {canApproveHere &&
                (isFullyReceived ? (
                  <ApproveOrderForm orderId={order.id} />
                ) : (
                  <p className="mt-4 rounded-lg bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
                    Waiting on the full quantity before this can be approved — {receivedTotal}{" "}
                    of {order.quantity_ordered} {item?.unit} received so far.
                  </p>
                ))}
            </div>
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
