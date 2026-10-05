import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { StatusBadge } from "@/components/StatusBadge";
import { LogReceivingForm } from "./LogReceivingForm";
import type { OrderStatus } from "@/types/database";

type Rel<T> = T | T[] | null;

type OpenOrderRow = {
  id: string;
  quantity_ordered: number;
  status: OrderStatus;
  placed_date: string;
  /** The order's own unit — receiving and approval stay in it. */
  unit: string;
  items: Rel<{ name: string }>;
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

export default async function ReceivingPage({
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

  const { data: ordersData } = await supabase
    .from("orders")
    .select(
      "id, quantity_ordered, unit, status, placed_date, items ( name ), shopkeepers ( name ), profiles ( full_name )",
    )
    .eq("site_id", selectedSiteId)
    .in("status", ["placed", "pending_approval"])
    .order("placed_date", { ascending: false });

  const openOrders = (ordersData ?? []) as unknown as OpenOrderRow[];
  const orderIds = openOrders.map((o) => o.id);

  const { data: logsData } =
    orderIds.length > 0
      ? await supabase
          .from("receiving_logs")
          .select(
            "id, order_id, quantity_received, condition_notes, invoice_number, received_date, profiles ( full_name )",
          )
          .in("order_id", orderIds)
          .order("received_date", { ascending: false })
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
          <h1 className="text-2xl font-extrabold text-brand-navy">Receiving</h1>
          <p className="text-[#6b7280]">
            Log deliveries against open orders — partial deliveries are fine.
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

      {openOrders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
          No open orders at this site right now.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
          {canReceiveHere && (
            <div className="hidden grid-cols-[44px_1.3fr_0.9fr_0.8fr_0.8fr_0.9fr_1fr_auto] gap-2.5 border-b border-brand-border bg-brand-cream px-5 py-3 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] sm:grid">
              <div />
              <div>ITEM</div>
              <div>ORDERED / RECEIVED</div>
              <div>QTY</div>
              <div>DATE</div>
              <div>INVOICE</div>
              <div>NOTES</div>
              <div />
            </div>
          )}

          <div className="divide-y divide-brand-border-soft">
            {openOrders.map((order) => {
              const item = one(order.items);
              const shopkeeper = one(order.shopkeepers);
              const placedByProfile = one(order.profiles);
              const receivedSoFar = receivedTotalByOrder.get(order.id) ?? 0;
              const orderLogs = logsByOrder.get(order.id) ?? [];

              return (
                <div key={order.id} className="px-1 py-2 sm:px-0 sm:py-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:hidden">
                    <p className="text-sm font-bold text-brand-navy">
                      {item?.name ?? "Unknown item"}
                    </p>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="px-4 pb-1 text-xs text-[#7b8494] sm:hidden">
                    Vendor: {shopkeeper?.name ?? "—"} · Placed by{" "}
                    {placedByProfile?.full_name ?? "Unknown"} on{" "}
                    {formatDate(order.placed_date)}
                  </p>

                  {canReceiveHere ? (
                    <LogReceivingForm
                      orderId={order.id}
                      itemName={item?.name ?? "Unknown item"}
                      itemUnit={order.unit}
                      quantityOrdered={order.quantity_ordered}
                      receivedSoFar={receivedSoFar}
                      remainingQuantity={order.quantity_ordered - receivedSoFar}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                      <span className="font-bold text-brand-navy">
                        {item?.name ?? "Unknown item"}{" "}
                        <span className="font-normal text-[#7b8494]">({order.unit})</span>
                      </span>
                      <span className="text-xs text-[#6b7280]">
                        {order.quantity_ordered} / {receivedSoFar}
                      </span>
                    </div>
                  )}

                  {orderLogs.length > 0 && (
                    <p className="px-5 pb-3 text-[11px] text-[#7b8494]">
                      {item?.name ?? "Item"} — receiving history ({orderLogs.length}):{" "}
                      {orderLogs
                        .map((log) => {
                          const receiver = one(log.profiles);
                          return `${log.quantity_received} ${order.unit} logged by ${
                            receiver?.full_name ?? "Unknown"
                          } on ${formatDate(log.received_date)}${
                            log.invoice_number ? ` · Invoice ${log.invoice_number}` : ""
                          }${log.condition_notes ? ` ("${log.condition_notes}")` : ""}`;
                        })
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
