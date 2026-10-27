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
  "rounded-lg border border-brand-input-border bg-white px-2.5 py-[7px] text-[12.5px] text-brand-navy placeholder:text-[#7b8494] focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40";

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

  // A toolbar along the top of the stock list card.
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-brand-border px-3 py-2.5">
      <div className="relative min-w-56 flex-1">
        <svg
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7b8494]"
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
          className={`${inputClass} w-full pl-8`}
        />
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]">From</span>
        <input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => update({ from: e.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]">To</span>
        <input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => update({ to: e.target.value })}
          className={inputClass}
        />
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[#374151]">
        <input
          type="checkbox"
          checked={filters.zero}
          onChange={(e) => update({ zero: e.target.checked })}
          className="h-4 w-4 accent-[#0f1a33]"
        />
        Show out-of-stock
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={() => update({ q: "", from: "", to: "" })}
          className="whitespace-nowrap text-[12.5px] font-semibold text-brand-navy underline"
        >
          Clear
        </button>
      )}

      <a
        href={`/inventory/export?${toQuery(siteId, filters)}`}
        className="whitespace-nowrap rounded-full border border-brand-navy bg-white px-3.5 py-[7px] text-[12.5px] font-bold text-brand-navy hover:bg-brand-navy hover:text-white"
      >
        <span aria-hidden>↓</span> Download Excel
      </a>
    </div>
  );
}
