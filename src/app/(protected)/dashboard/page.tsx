import Link from "next/link";
import { requireUser, SITE_ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database";

type SiteCard = {
  id: string;
  name: string;
  location: string | null;
  roles: string[];
};

type OrderStatusRow = { site_id: string; status: OrderStatus };

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  let sites: SiteCard[] = [];

  if (user.isAdmin) {
    const { data } = await supabase
      .from("sites")
      .select("id, name, location")
      .order("name");
    sites = (data ?? []).map((s) => ({ ...s, roles: ["Admin — full access"] }));
  } else {
    const bySite = new Map<string, SiteCard>();
    for (const a of user.siteAssignments) {
      const roleLabel = SITE_ROLE_LABELS[a.role] ?? a.role;
      const existing = bySite.get(a.site_id);
      if (existing) {
        existing.roles.push(roleLabel);
      } else {
        bySite.set(a.site_id, {
          id: a.site_id,
          name: a.site_name,
          location: null,
          roles: [roleLabel],
        });
      }
    }
    sites = Array.from(bySite.values());
  }

  const siteIds = sites.map((s) => s.id);
  const { data: orderStatusData } =
    siteIds.length > 0
      ? await supabase
          .from("orders")
          .select("site_id, status")
          .in("site_id", siteIds)
          .in("status", ["placed", "pending_approval"])
      : { data: [] as OrderStatusRow[] };

  const openOrdersBySite = new Map<string, number>();
  const needsApprovalBySite = new Map<string, number>();
  for (const row of (orderStatusData ?? []) as OrderStatusRow[]) {
    openOrdersBySite.set(row.site_id, (openOrdersBySite.get(row.site_id) ?? 0) + 1);
    if (row.status === "pending_approval") {
      needsApprovalBySite.set(
        row.site_id,
        (needsApprovalBySite.get(row.site_id) ?? 0) + 1,
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-navy">
          Welcome, {user.fullName.split(" ")[0]}
        </h1>
        <p className="text-[#6b7280]">
          {user.isAdmin
            ? "You have Admin access across every site."
            : sites.length > 0
              ? "Choose a site below to continue."
              : "You haven't been assigned to a site yet — ask your Admin to add you."}
        </p>
      </div>

      {sites.length === 0 && !user.isAdmin && (
        <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
          No sites assigned yet.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((site) => {
          const openOrders = openOrdersBySite.get(site.id) ?? 0;
          const needsApproval = needsApprovalBySite.get(site.id) ?? 0;

          return (
            <div
              key={site.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                needsApproval > 0
                  ? "border-[1.5px] border-[#f97316] shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
                  : "border-brand-border"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-navy text-base font-bold text-brand-gold-pale shadow-[0_0_0_2px_#fff,0_0_0_3px_#d9bf73]">
                  {site.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-brand-navy">{site.name}</h2>
                  {site.location && (
                    <p className="text-xs text-[#7b8494]">{site.location}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {site.roles.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-[#ecd9a0] bg-[#fbf3dc] px-2.5 py-1 text-[11px] font-bold text-[#7a5608]"
                  >
                    {r}
                  </span>
                ))}
              </div>

              <div className="mt-3.5 flex gap-2.5">
                <div className="flex-1 rounded-lg border border-[#d3cbb9] bg-[#f8f6f0] py-2.5 text-center">
                  <div className="text-xl font-extrabold leading-tight text-brand-navy">
                    {openOrders}
                  </div>
                  <div className="text-[10px] text-[#7b8494]">open orders</div>
                </div>
                <div
                  className={`flex-1 rounded-lg py-2.5 text-center ${
                    needsApproval > 0
                      ? "border border-[rgba(249,115,22,.45)] bg-[rgba(249,115,22,.08)]"
                      : "border border-[#d3cbb9] bg-[#f8f6f0]"
                  }`}
                >
                  <div
                    className={`text-xl font-extrabold leading-tight ${
                      needsApproval > 0 ? "text-[#c2410c]" : "text-brand-navy"
                    }`}
                  >
                    {needsApproval}
                  </div>
                  <div
                    className={`text-[10px] ${
                      needsApproval > 0 ? "text-[#c2410c]" : "text-[#7b8494]"
                    }`}
                  >
                    needs approval
                  </div>
                </div>
              </div>

              <Link
                href={`/orders?site=${site.id}`}
                className="mt-3.5 inline-block text-xs font-bold text-brand-navy underline decoration-brand-gold decoration-2 underline-offset-4 hover:text-brand-navy-2"
              >
                View orders →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
