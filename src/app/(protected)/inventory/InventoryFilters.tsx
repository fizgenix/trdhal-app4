"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Filters = { q: string; from: string; to: string; zero: boolean };

function toQuery(siteId: string, f: Filters) {
  const params = new URLSearchParams();
  params.set("site", siteId);
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.zero) params.set("zero", "1");
  return params.toString();
}

const inputClass =
  "rounded-[10px] border border-brand-input-border bg-white px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40";

/**
 * Search (item or PO, fuzzy), date range, show-out-of-stock and the Excel
 * download for the Stock Inventory page. Everything lives in the URL, the
 * same pattern as the Orders page's search and status tabs, so the view is
 * shareable and the download exports exactly what's on screen.
 */
export function InventoryFilters({ siteId, initial }: { siteId: string; initial: Filters }) {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync when the URL changes elsewhere (site switcher, back button)
  // — adjusted during render, the same pattern as OrderSearchBox.
  const initialKey = JSON.stringify(initial);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (initialKey !== prevInitialKey) {
    setPrevInitialKey(initialKey);
    setFilters(initial);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function update(next: Partial<Filters>, debounce = false) {
    const merged = { ...filters, ...next };
    setFilters(merged);
    if (timer.current) clearTimeout(timer.current);
    const go = () => router.push(`/inventory?${toQuery(siteId, merged)}`);
    if (debounce) timer.current = setTimeout(go, 300);
    else go();
  }

  const hasFilters = filters.q || filters.from || filters.to;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8494]"
          >
            <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value }, true)}
            placeholder="Search item or PO number…"
            aria-label="Search stock by item or PO number"
            className={`${inputClass} w-full pl-9`}
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]">From</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]">To</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            className={inputClass}
          />
        </label>

        <a
          href={`/inventory/export?${toQuery(siteId, filters)}`}
          className="inline-flex items-center gap-2 rounded-full border border-brand-navy px-5 py-2.5 text-sm font-bold text-brand-navy hover:bg-brand-navy hover:text-white"
        >
          <span aria-hidden>⬇</span> Download Excel
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#4b5563]">
          <input
            type="checkbox"
            checked={filters.zero}
            onChange={(e) => update({ zero: e.target.checked })}
            className="h-4 w-4 accent-[#0f1a33]"
          />
          Show out-of-stock items
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => update({ q: "", from: "", to: "" })}
            className="text-sm font-semibold text-brand-navy underline"
          >
            Clear search &amp; dates
          </button>
        )}
      </div>
    </div>
  );
}
