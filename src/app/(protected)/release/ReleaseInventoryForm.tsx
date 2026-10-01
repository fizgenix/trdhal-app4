"use client";

import { useActionState, useMemo, useState } from "react";
import { releaseInventory, type ReleaseFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";

type StockItem = { id: string; name: string; unit: string; available: number };
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
  const [selectedItemId, setSelectedItemId] = useState("");
  const [isNewBuilding, setIsNewBuilding] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern used by the other forms in this app.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
      setSelectedItemId("");
      setIsNewBuilding(false);
    }
  }

  const selectedItem = useMemo(
    () => stockItems.find((i) => i.id === selectedItemId) ?? null,
    [selectedItemId, stockItems],
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
          name="item_id"
          required
          defaultValue=""
          onChange={(e) => setSelectedItemId(e.target.value)}
        >
          <option value="" disabled>
            Choose an item
          </option>
          {stockItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} — {i.available} {i.unit} available
            </option>
          ))}
        </Select>
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
      />

      <Select
        label="Destination building"
        name="destination_building_id"
        required
        defaultValue=""
        onChange={(e) => setIsNewBuilding(e.target.value === "__new__")}
      >
        <option value="" disabled>
          Choose a building
        </option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        <option value="__new__">+ Add a new building…</option>
      </Select>

      {isNewBuilding && (
        <Field
          label="New building name"
          name="new_building_name"
          placeholder="e.g. Building 3"
          required={isNewBuilding}
        />
      )}

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
      {state.success && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700 sm:col-span-2">
          {state.success}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" disabled={isPending} fullWidth>
          {isPending ? "Releasing…" : "Release inventory"}
        </Button>
      </div>
    </form>
  );
}
