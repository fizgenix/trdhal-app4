import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { ReleasePanel } from "./ReleasePanel";
import type { StockItem } from "./ApprovedStockList";
import { PAGE_SIZE, pageFromParam, Pagination } from "@/components/ui/Pagination";

type Rel<T> = T | T[] | null;

type SiteInventoryRow = { item_id: string; unit: string; quantity_available: number };
type ItemRow = { id: string; name: string };
type BuildingRow = { id: string; name: string };

type ReleaseLogRow = {
  id: string;
  quantity_released: number;
  quality_notes: string | null;
  released_date: string;
  unit: string;
  items: Rel<{ name: string }>;
  buildings: Rel<{ name: string }>;
  profiles: Rel<{ full_name: string }>;
};

function one<T>(rel: Rel<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** Columns of a release row: date, item, qty, building, by, note. */
const RELEASE_GRID =
  "grid grid-cols-[110px_minmax(0,1.6fr)_110px_170px_120px_minmax(0,1fr)] items-center gap-3";

function formatQty(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; page?: string }>;
}) {
  const user = await requireUser();
  const { site: siteParam, page: pageParam } = await searchParams;
  const page = pageFromParam(pageParam);
  const supabase = await createClient();

  const sites = user.sites;

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
        You&apos;re not assigned to a site yet — ask your Admin to add you before you can
        release inventory.
      </div>
    );
  }

  const selectedSiteId = await resolveSelectedSiteId(sites, siteParam);

  const canReleaseHere =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === selectedSiteId && a.role === "ho2_receiving",
    );

  const [
    { data: inventoryData },
    { data: items },
    { data: buildingsData },
    { data: releasesData, count: releasesCount },
  ] =
    await Promise.all([
      supabase
        .from("site_inventory")
        .select("item_id, unit, quantity_available")
        .eq("site_id", selectedSiteId),
      supabase.from("items").select("id, name").order("name"),
      supabase.from("buildings").select("id, name").eq("site_id", selectedSiteId).order("name"),
      supabase
        .from("inventory_releases")
        .select(
          "id, quantity_released, unit, quality_notes, released_date, items ( name ), buildings ( name ), profiles ( full_name )",
          { count: "exact" },
        )
        .eq("site_id", selectedSiteId)
        .order("released_date", { ascending: false })
        .order("id")
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    ]);

  const itemsById = new Map<string, ItemRow>();
  for (const i of (items ?? []) as ItemRow[]) itemsById.set(i.id, i);

  const stockItems: StockItem[] = ((inventoryData ?? []) as unknown as SiteInventoryRow[])
    .map((row) => {
      const item = itemsById.get(row.item_id);
      if (!item) return null;
      return {
        key: `${row.item_id}|${row.unit}`,
        itemId: row.item_id,
        name: item.name,
        unit: row.unit,
        available: Number(row.quantity_available),
      };
    })
    .filter((v): v is StockItem => v !== null && v.available > 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));

  const buildings = (buildingsData ?? []) as BuildingRow[];
  const releases = (releasesData ?? []) as unknown as ReleaseLogRow[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Inventory Release</h1>
          <p className="text-[#6b7280]">
            Release approved stock to a building — deducts from this site&apos;s running inventory.
          </p>
        </div>
        {sites.length > 1 && (
          <SiteSwitcher basePath="/release" sites={sites} selectedSiteId={selectedSiteId} />
        )}
      </div>

      <ReleasePanel
        siteId={selectedSiteId}
        stockItems={stockItems}
        buildings={buildings}
        canRelease={canReleaseHere}
      />

      <div className="mt-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-extrabold text-brand-navy">Recent releases</h2>
          <span className="rounded-full border border-brand-border bg-white px-[7px] text-[11px] font-bold text-[#374151]">
            {releasesCount ?? 0}
          </span>
        </div>
        {releases.length === 0 && (releasesCount ?? 0) > 0 ? (
          <p className="rounded-xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No releases on this page — <Link href={`/release?site=${selectedSiteId}`} className="font-bold underline">back to the first page</Link>.
          </p>
        ) : releases.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No inventory has been released at this site yet.
          </p>
        ) : (
          <div className="rounded-xl border border-brand-border bg-white">
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div
                  className={`${RELEASE_GRID} rounded-t-xl border-b border-brand-border bg-brand-cream px-3.5 py-[9px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#8a836f]`}
                >
                  <span>Date</span>
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                  <span>To building</span>
                  <span>By</span>
                  <span>Note</span>
                </div>
                {releases.map((release) => {
                  const item = one(release.items)?.name ?? "Unknown item";
                  const building = one(release.buildings)?.name ?? "Unknown building";
                  return (
                    <div
                      key={release.id}
                      className={`${RELEASE_GRID} border-b border-brand-border-soft px-3.5 py-2.5 text-[13px] last:border-0 hover:bg-brand-cream`}
                    >
                      <span className="text-[#374151]">{formatDate(release.released_date)}</span>
                      <span title={item} className="truncate font-semibold text-brand-navy">
                        {item}
                      </span>
                      <span className="text-right font-extrabold text-[#b45309]">
                        −{formatQty(Number(release.quantity_released))} {release.unit}
                      </span>
                      <span
                        title={building}
                        className="max-w-full justify-self-start truncate rounded-full border border-brand-border bg-brand-cream px-2.5 py-0.5 text-xs font-bold text-brand-navy"
                      >
                        {building}
                      </span>
                      <span className="text-[#374151]">
                        {one(release.profiles)?.full_name ?? "Unknown"}
                      </span>
                      <span
                        title={release.quality_notes ?? undefined}
                        className="truncate italic text-[#6b6553]"
                      >
                        {release.quality_notes ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Pagination
              href={`/release?site=${selectedSiteId}`}
              page={page}
              total={releasesCount ?? 0}
              className="rounded-b-xl border-t border-brand-border-soft"
            />
          </div>
        )}
      </div>
    </div>
  );
}
