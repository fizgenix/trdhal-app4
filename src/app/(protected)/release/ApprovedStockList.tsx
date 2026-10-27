"use client";

import { useState } from "react";
import { Field } from "@/components/ui/Field";
import { matchScore, normalizeName, SHOW_THRESHOLD } from "@/lib/fuzzy";

/** One stock line — an item in one unit (the same item in another unit is a separate line). */
export type StockItem = { key: string; itemId: string; name: string; unit: string; available: number };

const formatQty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/**
 * The Release tab's "Approved stock" list: alphabetical (A → Z), at most
 * about 8 rows tall with the rest scrolling inside the card. Typing in the
 * search box filters the list as you type — "pvc" shows every item with
 * "pvc" in its name, still A → Z. Only if nothing contains the typed text
 * does it fall back to typo-tolerant matches ("pvcc", "condiut"). With
 * `onPick`, clicking an item picks it in the release form; `selectedKey`
 * marks the one picked there.
 */
export function ApprovedStockList({
  items,
  selectedKey,
  onPick,
}: {
  items: StockItem[];
  selectedKey?: string;
  onPick?: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalizeName(query);

  const containing = q ? items.filter((i) => normalizeName(i.name).includes(q)) : items;
  const shown =
    q && containing.length === 0
      ? items.filter((i) => matchScore(query, i.name) >= SHOW_THRESHOLD)
      : containing;

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Find an item"
        name="stock_lookup"
        type="search"
        autoComplete="off"
        placeholder="Search for an item…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <p className="text-[11.5px] text-[#6b6553]">
        {q
          ? `${shown.length} of ${items.length} items match · A → Z`
          : `${items.length} item${items.length === 1 ? "" : "s"} in stock · A → Z`}
        {onPick && " · click an item to release it"}
      </p>

      {q && shown.length === 0 && (
        <p className="py-3 text-sm text-[#7b8494]">No stock matches &quot;{query.trim()}&quot;.</p>
      )}

      {shown.length > 0 && (
        // ~8 rows visible; the rest scroll inside the card.
        <div className="max-h-[340px] overflow-y-auto rounded-[10px] border border-brand-border">
          <div className="sticky top-0 z-[2] grid grid-cols-[minmax(0,1fr)_90px] gap-3 border-b border-brand-border bg-brand-cream px-3 py-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-[#8a836f]">
            <span>Item</span>
            <span className="text-right">In stock</span>
          </div>
          {shown.map((i) => {
            const isPicked = i.key === selectedKey;
            const content = (
              <>
                <span className="min-w-0 break-words text-brand-navy">
                  {i.name} <span className="text-[#7b8494]">({i.unit})</span>
                </span>
                <span className="text-right font-extrabold text-brand-navy">
                  {formatQty(i.available)}
                </span>
              </>
            );
            const rowClass = `grid w-full grid-cols-[minmax(0,1fr)_90px] items-center gap-3 border-b border-brand-border-soft px-3 py-[9px] text-left text-[13px] last:border-0 ${
              isPicked ? "bg-[#fbf3dc] shadow-[inset_3px_0_0_#c9a227]" : "bg-white"
            }`;
            return onPick ? (
              <button
                key={i.key}
                type="button"
                onClick={() => onPick(i.key)}
                aria-pressed={isPicked}
                className={`${rowClass} cursor-pointer hover:bg-brand-cream`}
              >
                {content}
              </button>
            ) : (
              <div key={i.key} className={rowClass}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
