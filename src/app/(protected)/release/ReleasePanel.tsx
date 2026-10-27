"use client";

import { useState } from "react";
import { ApprovedStockList, type StockItem } from "./ApprovedStockList";
import { ReleaseInventoryForm } from "./ReleaseInventoryForm";

type Building = { id: string; name: string };

const cardClass = "flex min-w-0 flex-col rounded-xl border border-brand-border bg-white";
const bandClass =
  "rounded-t-xl border-b border-brand-border-soft bg-brand-cream px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-brand-navy";

/**
 * The Release tab's two cards side by side: the approved stock list and the
 * release form. They share the selected stock line — clicking an item in
 * the list picks it in the form, and the list marks whatever the form has
 * picked.
 */
export function ReleasePanel({
  siteId,
  stockItems,
  buildings,
  canRelease,
}: {
  siteId: string;
  stockItems: StockItem[];
  buildings: Building[];
  canRelease: boolean;
}) {
  const [selectedKey, setSelectedKey] = useState("");
  // Bumped only when the list picks an item, so the form's item box
  // re-mounts showing it (typing in the box itself doesn't re-mount it).
  const [pickVersion, setPickVersion] = useState(0);

  function pickFromList(key: string) {
    setSelectedKey(key);
    setPickVersion((v) => v + 1);
  }

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <div className={cardClass}>
        <div className={bandClass}>Approved stock</div>
        <div className="p-4">
          {stockItems.length === 0 ? (
            <p className="text-sm text-[#7b8494]">
              No approved stock to release yet — items become available once HO3 approves a delivery.
            </p>
          ) : (
            <ApprovedStockList
              items={stockItems}
              selectedKey={selectedKey}
              onPick={canRelease ? pickFromList : undefined}
            />
          )}
        </div>
      </div>

      {canRelease ? (
        stockItems.length > 0 && (
          <div className={cardClass}>
            <div className={bandClass}>Release stock</div>
            <ReleaseInventoryForm
              siteId={siteId}
              stockItems={stockItems}
              buildings={buildings}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              pickVersion={pickVersion}
            />
          </div>
        )
      ) : (
        <p className="rounded-xl border border-dashed border-brand-border bg-white p-6 text-center text-sm text-[#7b8494]">
          You have view-only access at this site. Only Receiving (HO2) users can release
          inventory.
        </p>
      )}
    </div>
  );
}
