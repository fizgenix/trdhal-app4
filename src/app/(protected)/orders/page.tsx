import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { StatusBadge } from "@/components/StatusBadge";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { NewOrderForm } from "./NewOrderForm";
import { OrderSearchBox } from "./OrderSearchBox";
import { editOrder, cancelOrder } from "./actions";
import type { OrderStatus } from "@/types/database";

const STATUS_TABS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "completed", label: "Completed" },
];

type ItemRow = { id: string; name: string; unit: string };
type ShopkeeperRow = { id: string; name: string };

type Rel<T> = T | T[] | null;

type OrderJoinRow = {
  id: string;
  po_number: string;
  quantity_ordered: number;
  status: OrderStatus;
  placed_date: string;
  placed_by: string;
  items: Rel<{ name: string; unit: string }>;
  shopkeepers: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

type EditLogJoinRow = {
  id: string;
  order_id: string;
  action: "edited" | "cancelled";
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
  order_id: string;
  approved_date: string;
  remarks: string | null;
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

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; status?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, status: statusParam, q: qParam } = await searchParams;
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
        see orders.
      </div>
    );
  }

  const selectedSiteId =
    siteParam && sites.some((s) => s.id === siteParam) ? siteParam : sites[0].id;

  const canOrderHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho1_ordering",
    );

  const [{ data: items }, { data: shopkeepers }, { data: ordersData }, { data: nextPoNumber }] =
    await Promise.all([
      supabase.from("items").select("id, name, unit").order("name"),
      supabase.from("shopkeepers").select("id, name").order("name"),
      supabase
        .from("orders")
        .select(
          "id, po_number, quantity_ordered, status, placed_date, placed_by, items ( name, unit ), shopkeepers ( name ), profiles ( full_name )",
        )
        .eq("site_id", selectedSiteId)
        .order("placed_date", { ascending: false }),
      canOrderHere
        ? supabase.rpc("peek_next_po_number")
        : Promise.resolve({ data: null as string | null }),
    ]);

  const orders = (ordersData ?? []) as unknown as OrderJoinRow[];
  const orderIds = orders.map((o) => o.id);

  const { data: editLogsData } =
    orderIds.length > 0
      ? await supabase
          .from("order_edit_log")
          .select("id, order_id, action, note, edited_at, profiles ( full_name )")
          .in("order_id", orderIds)
          .order("edited_at", { ascending: false })
      : { data: [] as EditLogJoinRow[] };

  const editLogs = (editLogsData ?? []) as unknown as EditLogJoinRow[];
  const logsByOrder = new Map<string, EditLogJoinRow[]>();
  for (const log of editLogs) {
    const list = logsByOrder.get(log.order_id) ?? [];
    list.push(log);
    logsByOrder.set(log.order_id, list);
  }

  // "Order stays visible with full history (ordered vs. received vs.
  // approved) even after completion" — pull the received total (and each
  // delivery's invoice number) per order so that history shows here too,
  // not just on the Receiving page.
  const { data: receivingLogsData } =
    orderIds.length > 0
      ? await supabase
          .from("receiving_logs")
          .select("order_id, quantity_received, invoice_number")
          .in("order_id", orderIds)
      : { data: [] as ReceivingLogRow[] };

  const receivedTotalByOrder = new Map<string, number>();
  const invoiceNumbersByOrder = new Map<string, string[]>();
  for (const row of (receivingLogsData ?? []) as unknown as ReceivingLogRow[]) {
    receivedTotalByOrder.set(
      row.order_id,
      (receivedTotalByOrder.get(row.order_id) ?? 0) + Number(row.quantity_received),
    );
    if (row.invoice_number) {
      const list = invoiceNumbersByOrder.get(row.order_id) ?? [];
      list.push(row.invoice_number);
      invoiceNumbersByOrder.set(row.order_id, list);
    }
  }

  const { data: approvalsData } =
    orderIds.length > 0
      ? await supabase
          .from("approvals")
          .select("order_id, approved_date, remarks, profiles ( full_name )")
          .in("order_id", orderIds)
      : { data: [] as ApprovalJoinRow[] };

  const approvalByOrder = new Map<string, ApprovalJoinRow>();
  for (const approval of (approvalsData ?? []) as unknown as ApprovalJoinRow[]) {
    approvalByOrder.set(approval.order_id, approval);
  }

  // Search matches the item name or shopkeeper name — applied on top of
  // (not instead of) the status tab filter below.
  const q = (qParam ?? "").trim().toLowerCase();
  const searchFiltered = q
    ? orders.filter((order) => {
        const item = one(order.items);
        const shopkeeper = one(order.shopkeepers);
        return (
          (item?.name.toLowerCase().includes(q) ?? false) ||
          (shopkeeper?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : orders;

  const visibleOrders = searchFiltered.filter(
    (o) => !statusParam || statusParam === "all" || o.status === statusParam,
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
          items={(items ?? []) as ItemRow[]}
          shopkeepers={(shopkeepers ?? []) as ShopkeeperRow[]}
          nextPoNumber={nextPoNumber}
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
                : searchFiltered.filter((o) => o.status === tab.value).length;
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
        {visibleOrders.map((order) => {
          const item = one(order.items);
          const shopkeeper = one(order.shopkeepers);
          const placedByProfile = one(order.profiles);
          const canManage =
            order.status === "placed" && (user.isAdmin || order.placed_by === user.id);
          const orderLogs = logsByOrder.get(order.id) ?? [];
          const receivedSoFar = receivedTotalByOrder.get(order.id) ?? 0;
          const approval = approvalByOrder.get(order.id);
          const invoiceNumbers = invoiceNumbersByOrder.get(order.id) ?? [];

          return (
            <div
              key={order.id}
              className="rounded-2xl border border-brand-border bg-white p-[18px] shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-bold text-brand-navy">
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
                    Ordered: {order.quantity_ordered} {item?.unit} · Received so far:{" "}
                    {receivedSoFar} {item?.unit} · Shopkeeper: {shopkeeper?.name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#7b8494]">
                    Placed by {placedByProfile?.full_name ?? "Unknown"} on{" "}
                    {formatDate(order.placed_date)}
                  </p>
                  {invoiceNumbers.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-[#7b8494]">
                      Invoice{invoiceNumbers.length > 1 ? "s" : ""}:{" "}
                      {invoiceNumbers.join(", ")}
                    </p>
                  )}
                </div>
                <StatusBadge status={order.status} />
              </div>

              {order.status !== "cancelled" && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efebe2]">
                  <div
                    className={`h-full ${
                      receivedSoFar >= order.quantity_ordered
                        ? "bg-status-completed"
                        : "bg-status-pending"
                    }`}
                    style={{
                      width: `${Math.min(100, (receivedSoFar / order.quantity_ordered) * 100)}%`,
                    }}
                  />
                </div>
              )}

              {canManage && (
                <div className="mt-4 flex flex-col gap-2 border-t border-brand-border-soft pt-4">
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-brand-navy">
                      Edit quantity
                    </summary>
                    <form action={editOrder} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="order_id" value={order.id} />
                      <div className="w-40">
                        <Field
                          label="New quantity"
                          name="quantity_ordered"
                          type="number"
                          step="0.01"
                          min="0.01"
                          defaultValue={order.quantity_ordered}
                          required
                        />
                      </div>
                      <div className="w-64">
                        <Field
                          label="Reason (optional)"
                          name="note"
                          placeholder="e.g. corrected typo"
                        />
                      </div>
                      <Button type="submit" variant="secondary">
                        Save
                      </Button>
                    </form>
                  </details>

                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-red-600">
                      Cancel order
                    </summary>
                    <form action={cancelOrder} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="order_id" value={order.id} />
                      <div className="w-64">
                        <Field
                          label="Reason (optional)"
                          name="note"
                          placeholder="e.g. wrong item ordered"
                        />
                      </div>
                      <Button type="submit" variant="danger">
                        Cancel this order
                      </Button>
                    </form>
                  </details>
                </div>
              )}

              {order.status === "completed" && approval && (
                <p className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
                  Approved by {one(approval.profiles)?.full_name ?? "Unknown"} on{" "}
                  {formatDate(approval.approved_date)}
                  {approval.remarks && ` — "${approval.remarks}"`}
                </p>
              )}

              {orderLogs.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-[#7b8494]">
                    History ({orderLogs.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-[#6b7280]">
                    {orderLogs.map((log) => {
                      const editor = one(log.profiles);
                      return (
                        <li key={log.id}>
                          {log.action === "edited" ? "Edited" : "Cancelled"} by{" "}
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

        {orders.length === 0 && (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No orders placed at this site yet.
          </p>
        )}
        {orders.length > 0 && visibleOrders.length === 0 && (
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
