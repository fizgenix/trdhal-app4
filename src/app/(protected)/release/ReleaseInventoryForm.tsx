"use client";

import { useActionState, useMemo, useState } from "react";
import { releaseInventory, type ReleaseFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

/** One stock line — an item in one unit. */
type StockItem = { key: string; itemId: string; name: string; unit: string; available: number };
type Building = { id: string; name: string };

const initialState: ReleaseFormState = { error: null, success: null };

export function ReleaseInventoryForm({
  siteId,
  stockItems,
  buildings,
}: {
  siteId: string;
  stockItems: StockItem[];
  buildings: Building[];
}) {
  const [state, formAction, isPending] = useActionState(releaseInventory, initialState);
  const [selectedKey, setSelectedKey] = useState("");
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern used by the other forms in this app.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
      setSelectedKey("");
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
      className="grid gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="site_id" value={siteId} />

      <div className="sm:col-span-2">
        <CardHeaderBand>Release stock</CardHeaderBand>
      </div>

      <div className="sm:col-span-2">
        <Select
          label="Item"
          name="stock_line"
          required
          defaultValue=""
          onChange={(e) => setSelectedKey(e.target.value)}
        >
          <option value="" disabled>
            Choose an item
          </option>
          {stockItems.map((i) => (
            <option key={i.key} value={i.key}>
              {i.name} — {i.available} {i.unit} available
            </option>
          ))}
        </Select>
        {/* Stock is per item *and* unit, so both go to the server. */}
        <input type="hidden" name="item_id" value={selectedItem?.itemId ?? ""} />
        <input type="hidden" name="unit" value={selectedItem?.unit ?? ""} />
      </div>

      <Field
        label={
          selectedItem
            ? `Quantity to release (up to ${selectedItem.available} ${selectedItem.unit})`
            : "Quantity to release"
        }
        name="quantity_released"
        type="number"
        step="0.01"
        min="0.01"
        max={selectedItem ? selectedItem.available : undefined}
        placeholder="e.g. 50"
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
