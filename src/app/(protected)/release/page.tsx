import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { ReleaseInventoryForm } from "./ReleaseInventoryForm";

type Rel<T> = T | T[] | null;

type SiteInventoryRow = { item_id: string; unit: string; quantity_available: number };
type ItemRow = { id: string; name: string };
type BuildingRow = { id: string; name: string };
/** One stock line — an item in one unit (the same item in another unit is a separate line). */
type StockItem = { key: string; itemId: string; name: string; unit: string; available: number };

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

  const [{ data: inventoryData }, { data: items }, { data: buildingsData }, { data: releasesData }] =
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
        )
        .eq("site_id", selectedSiteId)
        .order("released_date", { ascending: false })
        .limit(50),
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
    <div className="flex flex-col gap-8">
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

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm">
          <CardHeaderBand inset={5}>Approved stock</CardHeaderBand>
          {stockItems.length === 0 ? (
            <p className="mt-3 text-sm text-[#7b8494]">
              No approved stock to release yet — items become available once HO3 approves a delivery.
            </p>
          ) : (
            <div className="mt-1 flex flex-col">
              {stockItems.map((i) => (
                <div
                  key={i.key}
                  className="flex items-center justify-between border-b border-brand-border-soft py-2.5 text-sm last:border-0"
                >
                  <span className="text-brand-navy">
                    {i.name} <span className="text-[#7b8494]">({i.unit})</span>
                  </span>
                  <span className="font-bold text-brand-navy">{i.available}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {canReleaseHere ? (
          stockItems.length > 0 && (
            <ReleaseInventoryForm
              siteId={selectedSiteId}
              stockItems={stockItems}
              buildings={buildings}
            />
          )
        ) : (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
            You have view-only access at this site. Only Receiving (HO2) users can release
            inventory.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-brand-navy">Recent releases</h2>
        {releases.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
            No inventory has been released at this site yet.
          </p>
        ) : (
          releases.map((release) => {
            const item = one(release.items);
            const building = one(release.buildings);
            const releaser = one(release.profiles);
            return (
              <div
                key={release.id}
                className="rounded-2xl border border-brand-border bg-white p-5 shadow-sm"
              >
                <p className="font-semibold text-brand-navy">
                  {release.quantity_released} {release.unit} of {item?.name ?? "Unknown item"}{" "}
                  → {building?.name ?? "Unknown building"}
                </p>
                <p className="text-xs text-[#7b8494]">
                  Released by {releaser?.full_name ?? "Unknown"} on{" "}
                  {formatDate(release.released_date)}
                  {release.quality_notes && ` — "${release.quality_notes}"`}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
