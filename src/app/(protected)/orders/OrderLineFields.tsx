"use client";

import { useId, useState } from "react";
import { Field } from "@/components/ui/Field";
import { canonicalUnit, STANDARD_UNITS } from "@/lib/units";
import { NEW_ID, SearchableSelect } from "@/components/ui/SearchableSelect";

/** `unit` is the item's usual unit — pre-filled on the line, which can change it. */
export type OrderItemOption = { id: string; name: string; unit: string };

/**
 * One item line of a PO: item, quantity, that line's own unit and (with
 * `withDescription`) an optional short description. Field
 * names carry `lineKey` as a suffix (`quantity_ordered_2`) so a form can
 * hold several lines; the form also posts `line_keys` listing them, which
 * readLines() in actions.ts uses to read them back.
 */
export function OrderLineFields({
  lineKey,
  items,
  savedWhen,
  withDescription = false,
  inline = false,
  onRemove,
}: {
  lineKey: number;
  items: OrderItemOption[];
  savedWhen?: string;
  /** Adds the optional description box under the line (Orders tab only). */
  withDescription?: boolean;
  /**
   * One row under a column-header strip (New order form): labels are
   * hidden on desktop, where the strip names the columns, and the
   * description sits in the same row instead of below.
   */
  inline?: boolean;
  /** Shows a remove button for this line when given. */
  onRemove?: () => void;
}) {
  // Field ids default to the field name, which repeats across the several
  // add-item forms on the Orders page — give each line its own.
  const quantityId = useId();
  const descriptionId = useId();
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

  const labelClassName = inline ? "sm:sr-only" : "";
  const description = (
    <Field
      label="Description (optional)"
      id={descriptionId}
      name={`description_${lineKey}`}
      maxLength={200}
      placeholder="e.g. 25mm, ISI marked, brand Finolex"
      labelClassName={labelClassName}
    />
  );

  return (
    <div
      className={`grid items-start gap-3 ${
        inline && withDescription
          ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
          : "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      }`}
    >
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
        labelClassName={labelClassName}
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
        labelClassName={labelClassName}
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
        labelClassName={labelClassName}
      />

      {inline && withDescription && description}

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this item"
          className={`rounded-full px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 ${inline ? "justify-self-start sm:w-[78px]" : "self-end sm:mb-0.5"}`}
        >
          Remove
        </button>
      ) : (
        <span className={`hidden sm:block ${inline ? "sm:w-[78px]" : "sm:w-[72px]"}`} />
      )}

      {withDescription && !inline && <div className="sm:col-span-3">{description}</div>}
    </div>
  );
}
