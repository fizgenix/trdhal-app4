import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { loadInventory, poMatches, type Movement } from "@/lib/inventory";
import { InventoryFilters } from "./InventoryFilters";
import { paginate, Pagination } from "@/components/ui/Pagination";

// Phones: toggle + item + stock only; the other columns appear from `md` up.
const ROW_GRID =
  "grid grid-cols-[24px_minmax(0,1fr)_auto] md:grid-cols-[24px_minmax(0,2fr)_70px_110px_100px_110px_150px] items-center gap-3";

/** Columns of an item's in/out history: date, type, qty, balance, reference, by. */
const HISTORY_GRID =
  "grid grid-cols-[100px_60px_90px_90px_minmax(200px,1fr)_110px] items-center gap-3";

const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

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

function formatDay(day: string) {
  return formatDate(`${day}T00:00:00+05:30`);
}

function Reference({ m, unit, highlight }: { m: Movement; unit: string; highlight: boolean }) {
  if (m.type === "out") {
    return (
      <span>
        → {m.building ?? "Unknown building"}
        {m.notes && <span className="text-[#7b8494]"> · &quot;{m.notes}&quot;</span>}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span
        className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-bold text-brand-navy ${
          highlight ? "border-brand-gold bg-brand-gold-pale" : "border-brand-border bg-white"
        }`}
      >
        {m.poNumber ?? "—"}
      </span>
      {m.vendor && <span>{m.vendor}</span>}
      {m.invoices && m.invoices.length > 0 && (
        <span className="text-[#7b8494]">
          · Inv {m.invoices.join(", ")}
        </span>
      )}
      {m.overBy !== undefined && (
        <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10.5px] font-bold text-red-700">
          ▲ over +{formatQty(m.overBy)} {unit}
        </span>
      )}
      {m.shortBy !== undefined && (
        <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
          ▼ short-closed −{formatQty(m.shortBy)} {unit}
        </span>
      )}
      {m.remarks && <span className="text-[#7b8494]">· &quot;{m.remarks}&quot;</span>}
    </span>
  );
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    site?: string;
    q?: string;
    from?: string;
    to?: string;
    zero?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const supabase = await createClient();

  const sites = user.sites;

  if (sites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
        You&apos;re not assigned to a site yet — ask your Admin to add you before you can see
        stock.
      </div>
    );
  }

  const selectedSiteId = await resolveSelectedSiteId(sites, params.site);
  const filters = {
    q: params.q ?? "",
    from: isDay(params.from) ? params.from : "",
    to: isDay(params.to) ? params.to : "",
    zero: params.zero === "1",
  };

  const { lines, summary } = await loadInventory(supabase, selectedSiteId, {
    q: filters.q,
    from: filters.from || undefined,
    to: filters.to || undefined,
    showOutOfStock: filters.zero,
  });

  // 50 item lines per page; the filters stay in the page links.
  const linesPage = paginate(lines, params.page);
  const listParams = new URLSearchParams({ site: selectedSiteId });
  if (filters.q.trim()) listParams.set("q", filters.q.trim());
  if (filters.from) listParams.set("from", filters.from);
  if (filters.to) listParams.set("to", filters.to);
  if (filters.zero) listParams.set("zero", "1");

  const hasRange = !!(filters.from || filters.to);
  const periodLabel = hasRange
    ? `${filters.from ? formatDay(filters.from) : "start"} – ${filters.to ? formatDay(filters.to) : "today"}`
    : "all time";

  const tiles = [
    { label: "items in stock", value: summary.inStock },
    { label: "out of stock", value: summary.outOfStock, warn: summary.outOfStock > 0 },
    { label: `releases · ${periodLabel}`, value: summary.releases },
    { label: `POs approved in · ${periodLabel}`, value: summary.pos },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Stock Inventory</h1>
          <p className="text-[#6b7280]">
            Approved stock in (dated by when it was received), releases out — the full history of every item at this site.
          </p>
        </div>
        {sites.length > 1 && (
          <SiteSwitcher basePath="/inventory" sites={sites} selectedSiteId={selectedSiteId} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex items-baseline gap-2.5 rounded-xl border border-brand-border bg-white px-4 py-3"
          >
            <span
              className={`text-[22px] font-extrabold ${t.warn ? "text-[#c2410c]" : "text-brand-navy"}`}
            >
              {t.value}
            </span>
            <span className="text-xs text-[#6b6553]">{t.label}</span>
          </div>
        ))}
      </div>

      {/* No overflow-hidden here: it would stop the column headers sticking. */}
      <div className="rounded-xl border border-brand-border bg-white">
        <InventoryFilters siteId={selectedSiteId} initial={filters} />

        {lines.length === 0 ? (
          <p className="p-8 text-center text-[#7b8494]">
            {filters.q
              ? `No stock matches "${filters.q}".`
              : hasRange
                ? "No stock movements in this period."
                : "No approved stock at this site yet — items appear here once HO3 approves a delivery."}
          </p>
        ) : (
          <>
            {/* Column names stay visible while scrolling the list. */}
            <div
              className={`${ROW_GRID} sticky top-0 z-[3] border-b border-brand-border bg-brand-cream px-[22px] py-[9px] text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#8a836f] shadow-[0_4px_8px_-6px_rgba(15,26,51,0.2)]`}
            >
              <span />
              <span>Item</span>
              <span className="hidden md:block">Unit</span>
              <span className="hidden text-right md:block">Approved in</span>
              <span className="hidden text-right md:block">Released</span>
              <span className="text-right">In stock</span>
              <span className="hidden md:block">Last movement</span>
            </div>

            {linesPage.pageRows.map((line) => (
              <details
                key={line.key}
                className="group mx-2 mt-2 rounded-[10px] border border-brand-border bg-white shadow-[0_1px_0_rgba(15,26,51,0.04)]"
              >
                <summary
                  className={`${ROW_GRID} cursor-pointer list-none rounded-[10px] px-3.5 py-3 text-[13px] hover:bg-brand-cream group-open:rounded-b-none group-open:bg-brand-cream [&::-webkit-details-marker]:hidden`}
                >
                  <span
                    aria-hidden
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-brand-border text-[10px] text-brand-navy"
                  >
                    <span className="group-open:hidden">▼</span>
                    <span className="hidden group-open:inline">▲</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="break-words font-bold text-brand-navy">{line.itemName}</span>
                    {line.description && (
                      <span className="break-words text-[11.5px] leading-snug text-[#6b6553]">
                        {line.description}
                      </span>
                    )}
                    <span className="text-[11px] text-[#7b8494] md:hidden">
                      {line.unit} · in {formatQty(line.approvedIn)} · out {formatQty(line.released)}
                    </span>
                  </span>
                  <span className="hidden text-[#6b6553] md:block">{line.unit}</span>
                  <span className="hidden text-right text-[#374151] md:block">
                    {formatQty(line.approvedIn)}
                  </span>
                  <span className="hidden text-right text-[#374151] md:block">
                    {formatQty(line.released)}
                  </span>
                  <span
                    className={`text-right font-extrabold ${
                      line.inStock < 0
                        ? "text-red-700"
                        : line.inStock === 0
                          ? "text-[#9ca3af]"
                          : "text-brand-navy"
                    }`}
                  >
                    {formatQty(line.inStock)}
                    {line.inStock < 0 && (
                      <span className="block text-[10px] font-bold">released before approval</span>
                    )}
                  </span>
                  <span className="hidden text-xs text-[#6b6553] md:block">
                    {line.lastMovement
                      ? `${formatDate(line.lastMovement.date)} · ${line.lastMovement.type === "in" ? "IN" : "OUT"}`
                      : "—"}
                  </span>
                </summary>

                <div className="overflow-x-auto rounded-b-[10px] border-t border-brand-border-soft bg-brand-cream px-3.5 pb-2 pt-1 md:pl-[50px]">
                  <div className="min-w-[720px]">
                    <div
                      className={`${HISTORY_GRID} border-b border-[#e6dfd1] py-[7px] text-[10px] font-bold uppercase tracking-[0.09em] text-[#8a836f]`}
                    >
                      <span>Date</span>
                      <span>Type</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Balance</span>
                      <span>Reference</span>
                      <span>By</span>
                    </div>
                    {filters.from && (
                      <div className={`${HISTORY_GRID} py-[7px] text-[12.5px] text-[#7b8494]`}>
                        <span>{formatDay(filters.from)}</span>
                        <span className="col-span-2">Opening balance</span>
                        <span className="text-right font-bold">{formatQty(line.openingBalance)}</span>
                      </div>
                    )}
                    {line.movements.map((m) => (
                      <div key={`${m.type}-${m.id}`} className={`${HISTORY_GRID} py-[7px] text-[12.5px]`}>
                        <span className="whitespace-nowrap text-[#374151]">{formatDate(m.date)}</span>
                        <span>
                          <span
                            className={`rounded-full border px-2 py-px text-[10.5px] font-bold ${
                              m.type === "in"
                                ? "border-[#b7e2c4] bg-[#e7f6ec] text-[#166534]"
                                : "border-[#fed7aa] bg-[#fff1e6] text-[#9a3412]"
                            }`}
                          >
                            {m.type === "in" ? "IN" : "OUT"}
                          </span>
                        </span>
                        <span
                          className={`whitespace-nowrap text-right font-bold ${
                            m.type === "in" ? "text-[#15803d]" : "text-[#9a3412]"
                          }`}
                        >
                          {m.quantity === 0
                            ? "—"
                            : `${m.quantity > 0 ? "+" : "−"}${formatQty(Math.abs(m.quantity))}`}
                        </span>
                        <span
                          className={`text-right font-bold ${m.balance < 0 ? "text-red-700" : "text-brand-navy"}`}
                        >
                          {formatQty(m.balance)}
                        </span>
                        <span className="min-w-0 text-[#374151]">
                          <Reference
                            m={m}
                            unit={line.unit}
                            highlight={poMatches(filters.q, m.poNumber)}
                          />
                        </span>
                        <span className="text-[#374151]">{m.by}</span>
                      </div>
                    ))}
                    {line.movements.length === 0 && (
                      <p className="py-2 text-[12.5px] text-[#7b8494]">No movements in this period.</p>
                    )}
                  </div>
                </div>
              </details>
            ))}

            <div className="mt-2 rounded-b-xl border-t border-brand-border-soft bg-brand-cream">
              <Pagination href={`/inventory?${listParams.toString()}`} page={linesPage.page} total={linesPage.total} />
              <p className="px-3.5 py-2.5 text-xs text-[#6b6553]">
                Click an item to see its in/out history. Column headers stay visible while you scroll.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
