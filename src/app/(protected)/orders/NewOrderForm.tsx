"use client";

import { useActionState, useState } from "react";
import { createOrder, type OrderFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { canonicalUnit, STANDARD_UNITS } from "@/lib/units";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { NEW_ID, SearchableSelect } from "@/components/ui/SearchableSelect";

/** `unit` is the item's usual unit — pre-filled on the order, which can change it. */
type Item = { id: string; name: string; unit: string };
type Shopkeeper = { id: string; name: string };

const initialState: OrderFormState = { error: null, success: null };

export function NewOrderForm({
  siteId,
  items,
  shopkeepers,
}: {
  siteId: string;
  items: Item[];
  shopkeepers: Shopkeeper[];
}) {
  const [state, formAction, isPending] = useActionState(createOrder, initialState);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [orderUnit, setOrderUnit] = useState("");
  const [isNewShopkeeper, setIsNewShopkeeper] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Clear the form after a successful submit — fields are uncontrolled so
  // re-mounting (via the key bump) is what resets them, rather than
  // leaving stale values sitting behind the success message. Adjusting
  // state during render in response to a changed prop/state value (rather
  // than in an effect) is the pattern React recommends for this —
  // https://react.dev/learn/you-might-not-need-an-effect
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
      setSelectedItemId("");
      setOrderUnit("");
      setIsNewShopkeeper(false);
    }
  }

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
  // still change it for this order.
  function handleItemSelect(id: string) {
    setSelectedItemId(id);
    const usual = items.find((i) => i.id === id)?.unit;
    if (usual) setOrderUnit(usual);
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="site_id" value={siteId} />

      <div className="sm:col-span-2">
        <CardHeaderBand>Place a new order</CardHeaderBand>
      </div>

      <div className="sm:col-span-2">
        <Field label="PO Number" name="po_number" placeholder="e.g. PO-00123" required />
      </div>

      <div className="sm:col-span-2">
        <SearchableSelect
          label="Item"
          name="item_id"
          newNameField="new_item_name"
          noun="item"
          required
          placeholder="Search or add an item…"
          options={items.map((i) => ({ id: i.id, name: i.name, label: i.name }))}
          onSelect={handleItemSelect}
        />
      </div>

      <Field
        label="Quantity ordered"
        name="quantity_ordered"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="e.g. 250"
        required
        suffix={orderUnit || undefined}
      />

      {/* The order's unit — fixed once the order is placed: its receiving,
          approval and stock all stay in this unit. Re-keyed on item change
          so it re-mounts pre-filled with that item's usual unit. */}
      <SearchableSelect
        key={`unit-${selectedItemId}`}
        label="Unit"
        name="unit_id"
        newNameField="unit_new"
        noun="unit"
        required
        placeholder="Search or add a unit…"
        options={unitOptions}
        initial={orderUnit ? { id: orderUnit, label: unitLabel(orderUnit) } : undefined}
        canonicalize={canonicalUnit}
        onSelect={(id, text) => setOrderUnit(id === NEW_ID ? text.trim() : id)}
      />

      <div className="sm:col-span-2">
        <SearchableSelect
          label="Vendor"
          name="shopkeeper_id"
          newNameField="new_shopkeeper_name"
          noun="vendor"
          required
          placeholder="Search or add a vendor…"
          options={shopkeepers.map((s) => ({ id: s.id, name: s.name, label: s.name }))}
          onSelect={(id) => setIsNewShopkeeper(id === NEW_ID)}
        />
      </div>

      {isNewShopkeeper && (
        <div className="sm:col-span-2">
          <Field
            label="New vendor's phone (optional)"
            name="new_shopkeeper_phone"
            type="tel"
            placeholder="+91 90000 00000"
          />
        </div>
      )}

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={isPending} fullWidth>
          {isPending ? "Placing order… please wait" : "Place order"}
        </Button>
      </div>
    </form>
  );
}
