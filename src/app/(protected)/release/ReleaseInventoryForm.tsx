"use client";

import { useActionState, useMemo, useState } from "react";
import { releaseInventory, type ReleaseFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { StockItem } from "./ApprovedStockList";

type Building = { id: string; name: string };

const initialState: ReleaseFormState = { error: null, success: null };

export function ReleaseInventoryForm({
  siteId,
  stockItems,
  buildings,
  selectedKey,
  onSelectKey,
  pickVersion,
}: {
  siteId: string;
  stockItems: StockItem[];
  buildings: Building[];
  /** The picked stock line — shared with the Approved stock list (ReleasePanel). */
  selectedKey: string;
  onSelectKey: (key: string) => void;
  /** Changes when the list picks an item, re-mounting the item box to show it. */
  pickVersion: number;
}) {
  const [state, formAction, isPending] = useActionState(releaseInventory, initialState);
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern used by the other forms in this app.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
      onSelectKey("");
    }
  }

  const selectedItem = useMemo(
    () => stockItems.find((i) => i.key === selectedKey) ?? null,
    [selectedKey, stockItems],
  );

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-3.5 p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="site_id" value={siteId} />

      <div className="sm:col-span-2">
        <SearchableSelect
          key={pickVersion}
          initial={
            selectedItem
              ? {
                  id: selectedItem.key,
                  label: `${selectedItem.name} — ${selectedItem.available} ${selectedItem.unit} available`,
                }
              : undefined
          }
          inputClassName={selectedItem ? "border-brand-gold-border bg-[#fffbf0]" : ""}
          label="Item"
          name="stock_line"
          noun="item"
          allowNew={false}
          required
          placeholder="Search for an item…"
          options={stockItems.map((i) => ({
            id: i.key,
            name: i.name,
            label: `${i.name} — ${i.available} ${i.unit} available`,
          }))}
          onSelect={(id) => onSelectKey(id)}
        />
        {/* Stock is per item *and* unit, so both go to the server. */}
        <input type="hidden" name="item_id" value={selectedItem?.itemId ?? ""} />
        <input type="hidden" name="unit" value={selectedItem?.unit ?? ""} />
      </div>

      <Field
        label="Quantity to release"
        name="quantity_released"
        type="number"
        step="0.01"
        min="0.01"
        max={selectedItem ? selectedItem.available : undefined}
        placeholder={
          selectedItem
            ? `Max ${selectedItem.available.toLocaleString("en-IN")} ${selectedItem.unit}`
            : "e.g. 50"
        }
        required
        suffix={selectedItem?.unit}
      />

      <SearchableSelect
        label="Destination building"
        name="destination_building_id"
        newNameField="new_building_name"
        noun="building"
        savedWhen="you release the stock"
        required
        placeholder="Search or add a building…"
        options={buildings.map((b) => ({ id: b.id, name: b.name, label: b.name }))}
      />

      <div className="sm:col-span-2">
        <Field
          label="Quality / condition notes (optional)"
          name="quality_notes"
          placeholder="e.g. good condition"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={isPending} fullWidth>
          {isPending ? "Releasing… please wait" : "Release inventory"}
        </Button>
      </div>
    </form>
  );
}
