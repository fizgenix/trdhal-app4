"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/Field";
import { canonicalUnit, STANDARD_UNITS } from "@/lib/units";
import { NEW_ID, SearchableSelect } from "@/components/ui/SearchableSelect";

/** `unit` is the item's usual unit — pre-filled on the line, which can change it. */
export type OrderItemOption = { id: string; name: string; unit: string };

/**
 * One item line of a PO: item, quantity and that line's own unit. Field
 * names carry `lineKey` as a suffix (`quantity_ordered_2`) so a form can
 * hold several lines; the form also posts `line_keys` listing them, which
 * readLines() in actions.ts uses to read them back.
 */
export function OrderLineFields({
  lineKey,
  items,
  savedWhen,
  onRemove,
}: {
  lineKey: number;
  items: OrderItemOption[];
  savedWhen?: string;
  /** Shows a remove button for this line when given. */
  onRemove?: () => void;
}) {
  // Field ids default to the field name, which repeats across the several
  // add-item forms on the Orders page — give each line its own.
  const quantityId = useId();
  const [selectedItemId, setSelectedItemId] = useState("");
  const [orderUnit, setOrderUnit] = useState("");

  // Standard units plus any other unit already used on an item, so a
  // custom one added once ("trolley") is offered next time too.
  const unitOptions = [
    ...STANDARD_UNITS.map((u) => ({ id: u.value, name: u.value, label: u.label })),
    ...Array.from(new Set(items.map((i) => i.unit)))
      .filter((unit) => !STANDARD_UNITS.some((u) => u.value === unit))
      .map((unit) => ({ id: unit, name: unit, label: unit })),
  ];
  const unitLabel = (unit: string) => unitOptions.find((u) => u.id === unit)?.label ?? unit;

  // Picking an item pre-fills the unit with its usual one; the user can
  // still change it for this line.
  function handleItemSelect(id: string) {
    setSelectedItemId(id);
    const usual = items.find((i) => i.id === id)?.unit;
    if (usual) setOrderUnit(usual);
  }

  return (
    <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <SearchableSelect
        label="Item"
        name={`item_id_${lineKey}`}
        newNameField={`new_item_name_${lineKey}`}
        noun="item"
        required
        placeholder="Search or add an item…"
        options={items.map((i) => ({ id: i.id, name: i.name, label: i.name }))}
        onSelect={handleItemSelect}
        savedWhen={savedWhen}
      />

      <Field
        label="Quantity"
        id={quantityId}
        name={`quantity_ordered_${lineKey}`}
        type="number"
        step="0.01"
        min="0.01"
        placeholder="e.g. 250"
        required
        suffix={orderUnit || undefined}
      />

      {/* The line's unit — fixed once placed: its receiving, approval and
          stock all stay in this unit. Re-keyed on item change so it
          re-mounts pre-filled with that item's usual unit. */}
      <SearchableSelect
        key={`unit-${selectedItemId}`}
        label="Unit"
        name={`unit_id_${lineKey}`}
        newNameField={`unit_new_${lineKey}`}
        noun="unit"
        required
        placeholder="Search or add a unit…"
        options={unitOptions}
        initial={orderUnit ? { id: orderUnit, label: unitLabel(orderUnit) } : undefined}
        canonicalize={canonicalUnit}
        onSelect={(id, text) => setOrderUnit(id === NEW_ID ? text.trim() : id)}
        savedWhen={savedWhen}
      />

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this item"
          className="self-end rounded-full px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 sm:mb-0.5"
        >
          Remove
        </button>
      ) : (
        <span className="hidden sm:block sm:w-[72px]" />
      )}
    </div>
  );
}
