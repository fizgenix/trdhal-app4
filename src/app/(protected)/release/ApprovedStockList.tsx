"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { matchScore, normalizeName, SHOW_THRESHOLD } from "@/lib/fuzzy";

type StockRow = { key: string; name: string; unit: string; available: number };

const formatQty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * The Release tab's "Approved stock" list: alphabetical (A → Z), at most
 * about 8 rows tall with the rest scrolling inside the card. Typing in the
 * search box filters the list as you type — "pvc" shows every item with
 * "pvc" in its name, still A → Z. Only if nothing contains the typed text
 * does it fall back to typo-tolerant matches ("pvcc", "condiut").
 */
export function ApprovedStockList({ items }: { items: StockRow[] }) {
  const [query, setQuery] = useState("");
  const q = normalizeName(query);

  const containing = q ? items.filter((i) => normalizeName(i.name).includes(q)) : items;
  const shown =
    q && containing.length === 0
      ? items.filter((i) => matchScore(query, i.name) >= SHOW_THRESHOLD)
      : containing;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Field
        label="Find an item"
        name="stock_lookup"
        type="search"
        autoComplete="off"
        placeholder="Search for an item…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <p className="text-[11px] text-[#7b8494]">
        {q
          ? `${shown.length} of ${items.length} items match · A → Z`
          : `${items.length} item${items.length === 1 ? "" : "s"} in stock · A → Z`}
      </p>

      {q && shown.length === 0 && (
        <p className="py-3 text-sm text-[#7b8494]">No stock matches &quot;{query.trim()}&quot;.</p>
      )}

      {shown.length > 0 && (
        // ~8 rows visible; the rest scroll inside the card.
        <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-brand-border-soft">
          <div className="sticky top-0 flex items-center justify-between border-b border-brand-border-soft bg-brand-cream px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
            <span>Item</span>
            <span>In stock</span>
          </div>
          {shown.map((i) => (
            <div
              key={i.key}
              className="flex items-center justify-between gap-3 border-b border-brand-border-soft px-3 py-2.5 text-sm last:border-0"
            >
              <span className="min-w-0 break-words text-brand-navy">
                {i.name} <span className="text-[#7b8494]">({i.unit})</span>
              </span>
              <span className="shrink-0 font-bold text-brand-navy">
                {formatQty(i.available)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
