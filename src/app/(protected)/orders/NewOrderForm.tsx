"use client";

import { useActionState, useState } from "react";
import { createOrder, type OrderFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

type Item = { id: string; name: string; unit: string };
type Shopkeeper = { id: string; name: string };

const initialState: OrderFormState = { error: null, success: null };

export function NewOrderForm({
  siteId,
  items,
  shopkeepers,
  nextPoNumber,
}: {
  siteId: string;
  items: Item[];
  shopkeepers: Shopkeeper[];
  /** Preview of the PO Number the next order will get — see peek_next_po_number() in the migrations. */
  nextPoNumber: string | null;
}) {
  const [state, formAction, isPending] = useActionState(createOrder, initialState);
  const [isNewItem, setIsNewItem] = useState(false);
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
      setIsNewItem(false);
      setIsNewShopkeeper(false);
    }
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
        <Field
          id="po_number_preview"
          label="PO Number (auto-assigned)"
          value={nextPoNumber ?? "—"}
          readOnly
          disabled
          className="cursor-not-allowed bg-brand-content text-brand-navy/70"
        />
      </div>

      <div className="sm:col-span-2">
        <SearchableSelect
          label="Item"
          name="item_id"
          required
          placeholder="Search items…"
          options={items.map((i) => ({ id: i.id, label: `${i.name} (${i.unit})` }))}
          addNewLabel="+ Add a new item…"
          onSelect={(id) => setIsNewItem(id === "__new__")}
        />
      </div>

      {isNewItem && (
        <>
          <Field
            label="New item name"
            name="new_item_name"
            placeholder="e.g. Tiles Quality 1"
            required={isNewItem}
          />
          <Field
            label="Unit"
            name="new_item_unit"
            placeholder="e.g. sq.ft., bags, pcs"
            required={isNewItem}
          />
        </>
      )}

      <Field
        label="Quantity ordered"
        name="quantity_ordered"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="e.g. 250"
        required
      />

      <SearchableSelect
        label="Shopkeeper"
        name="shopkeeper_id"
        required
        placeholder="Search shopkeepers…"
        options={shopkeepers.map((s) => ({ id: s.id, label: s.name }))}
        addNewLabel="+ Add a new shopkeeper…"
        onSelect={(id) => setIsNewShopkeeper(id === "__new__")}
      />

      {isNewShopkeeper && (
        <>
          <Field
            label="New shopkeeper name"
            name="new_shopkeeper_name"
            placeholder="e.g. Agarwal Traders"
            required={isNewShopkeeper}
          />
          <Field
            label="Shopkeeper phone (optional)"
            name="new_shopkeeper_phone"
            type="tel"
            placeholder="+91 90000 00000"
          />
        </>
      )}

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
          {isPending ? "Placing order…" : "Place order"}
        </Button>
      </div>
    </form>
  );
}
