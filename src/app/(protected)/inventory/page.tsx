import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteSwitcher } from "@/components/SiteSwitcher";
import { resolveSelectedSiteId } from "@/lib/selected-site";
import { loadInventory, poMatches, type Movement } from "@/lib/inventory";
import { InventoryFilters } from "./InventoryFilters";

// Phones: item + stock only; the other columns appear from `sm` up.
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_0.6fr_0.9fr_0.9fr_0.9fr_1.1fr] items-center gap-3";

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
          highlight ? "border-brand-gold bg-brand-gold-pale" : "border-brand-border bg-brand-cream"
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
  searchParams: Promise<{ site?: string; q?: string; from?: string; to?: string; zero?: string }>;
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-navy">Stock Inventory</h1>
          <p className="text-[#6b7280]">
            Approved stock in, releases out — the full history of every item at this site.
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
            className="rounded-2xl border border-brand-border bg-white px-4 py-3.5 shadow-sm"
          >
            <div
              className={`text-2xl font-extrabold ${t.warn ? "text-[#c2410c]" : "text-brand-navy"}`}
            >
              {t.value}
            </div>
            <div className="text-[11px] text-[#7b8494]">{t.label}</div>
          </div>
        ))}
      </div>

      <InventoryFilters siteId={selectedSiteId} initial={filters} />

      {lines.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-border bg-white p-8 text-center text-[#7b8494]">
          {filters.q
            ? `No stock matches "${filters.q}".`
            : hasRange
              ? "No stock movements in this period."
              : "No approved stock at this site yet — items appear here once HO3 approves a delivery."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
          <div
            className={`${ROW_GRID} hidden border-b border-brand-border bg-brand-cream px-5 py-3 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f] sm:grid`}
          >
            <div>Item</div>
            <div>Unit</div>
            <div className="text-right">Approved in</div>
            <div className="text-right">Released</div>
            <div className="text-right">In stock</div>
            <div>Last movement</div>
          </div>

          <div className="divide-y divide-brand-border-soft">
            {lines.map((line) => (
              <details key={line.key} className="group">
                <summary
                  className={`${ROW_GRID} cursor-pointer list-none px-5 py-3.5 hover:bg-[#fbfaf6] [&::-webkit-details-marker]:hidden`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[#8a836f] transition-transform group-open:rotate-90">▸</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-brand-navy">
                        {line.itemName}
                      </span>
                      <span className="block text-[11px] text-[#7b8494] sm:hidden">
                        {line.unit} · in {formatQty(line.approvedIn)} · out{" "}
                        {formatQty(line.released)}
                      </span>
                    </span>
                  </div>
                  <div className="hidden text-xs text-[#6b7280] sm:block">{line.unit}</div>
                  <div className="hidden text-right text-sm text-[#4b5563] sm:block">
                    {formatQty(line.approvedIn)}
                  </div>
                  <div className="hidden text-right text-sm text-[#4b5563] sm:block">
                    {formatQty(line.released)}
                  </div>
                  <div
                    className={`text-right text-sm font-extrabold ${
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
                  </div>
                  <div className="hidden text-xs text-[#6b7280] sm:block">
                    {line.lastMovement
                      ? `${formatDate(line.lastMovement.date)} · ${line.lastMovement.type === "in" ? "IN" : "OUT"}`
                      : "—"}
                  </div>
                </summary>

                <div className="overflow-x-auto border-t border-brand-border-soft bg-[#fbfaf6] px-5 py-3">
                  <table className="w-full min-w-[640px] text-left text-xs text-[#4b5563]">
                    <thead className="text-[10px] font-bold uppercase tracking-wider text-[#8a836f]">
                      <tr>
                        <th className="py-1.5 pr-3 font-bold">Date</th>
                        <th className="py-1.5 pr-3 font-bold">Type</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Qty</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Balance</th>
                        <th className="py-1.5 pr-3 font-bold">Reference</th>
                        <th className="py-1.5 font-bold">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border-soft">
                      {filters.from && (
                        <tr className="text-[#7b8494]">
                          <td className="py-2 pr-3">{formatDay(filters.from)}</td>
                          <td className="py-2 pr-3" colSpan={2}>
                            Opening balance
                          </td>
                          <td className="py-2 pr-3 text-right font-bold">
                            {formatQty(line.openingBalance)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      )}
                      {line.movements.map((m) => (
                        <tr key={`${m.type}-${m.id}`}>
                          <td className="whitespace-nowrap py-2 pr-3">{formatDate(m.date)}</td>
                          <td className="py-2 pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                m.type === "in"
                                  ? "bg-[rgba(34,197,94,.15)] text-[#166534]"
                                  : "bg-[rgba(249,115,22,.15)] text-[#9a3412]"
                              }`}
                            >
                              {m.type === "in" ? "IN" : "OUT"}
                            </span>
                          </td>
                          <td
                            className={`whitespace-nowrap py-2 pr-3 text-right font-bold ${
                              m.type === "in" ? "text-[#166534]" : "text-[#9a3412]"
                            }`}
                          >
                            {m.quantity === 0
                              ? "—"
                              : `${m.quantity > 0 ? "+" : "−"}${formatQty(Math.abs(m.quantity))}`}
                          </td>
                          <td
                            className={`py-2 pr-3 text-right font-bold ${m.balance < 0 ? "text-red-700" : "text-brand-navy"}`}
                          >
                            {formatQty(m.balance)}
                          </td>
                          <td className="py-2 pr-3">
                            <Reference
                              m={m}
                              unit={line.unit}
                              highlight={poMatches(filters.q, m.poNumber)}
                            />
                          </td>
                          <td className="whitespace-nowrap py-2">{m.by}</td>
                        </tr>
                      ))}
                      {line.movements.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-2 text-[#7b8494]">
                            No movements in this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
