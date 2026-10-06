"use client";

import { useActionState, useState } from "react";
import { createOrder, type OrderFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { NEW_ID, SearchableSelect } from "@/components/ui/SearchableSelect";
import { OrderLineFields, type OrderItemOption } from "./OrderLineFields";

type Shopkeeper = { id: string; name: string };

const initialState: OrderFormState = { error: null, success: null };

export function NewOrderForm({
  siteId,
  items,
  shopkeepers,
}: {
  siteId: string;
  items: OrderItemOption[];
  shopkeepers: Shopkeeper[];
}) {
  const [state, formAction, isPending] = useActionState(createOrder, initialState);
  const [isNewShopkeeper, setIsNewShopkeeper] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // Keys of the item lines on screen. Keys are never reused, so removing a
  // line doesn't shift the fields of the lines below it.
  const [lineKeys, setLineKeys] = useState([0]);
  const [nextLineKey, setNextLineKey] = useState(1);

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
      setIsNewShopkeeper(false);
      setLineKeys([0]);
      setNextLineKey(1);
    }
  }

  function addLine() {
    setLineKeys((keys) => [...keys, nextLineKey]);
    setNextLineKey((k) => k + 1);
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="line_keys" value={lineKeys.join(",")} />

      <div className="sm:col-span-2">
        <CardHeaderBand>Place a new order</CardHeaderBand>
      </div>

      <Field label="PO Number" name="po_number" placeholder="e.g. PO-00123" required />

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

      <div className="flex flex-col gap-3 border-t border-brand-border-soft pt-4 sm:col-span-2">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
          Items on this PO ({lineKeys.length})
        </p>
        {lineKeys.map((key, i) => (
          <div
            key={key}
            className={i > 0 ? "border-t border-dashed border-brand-border-soft pt-3" : ""}
          >
            <OrderLineFields
              lineKey={key}
              items={items}
              onRemove={
                lineKeys.length > 1
                  ? () => setLineKeys((keys) => keys.filter((k) => k !== key))
                  : undefined
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addLine}
          className="self-start rounded-full border border-dashed border-brand-navy px-4 py-2 text-sm font-bold text-brand-navy hover:bg-brand-cream"
        >
          + Add another item
        </button>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button type="submit" loading={isPending} fullWidth>
          {isPending
            ? "Placing order… please wait"
            : `Place order (${lineKeys.length} item${lineKeys.length === 1 ? "" : "s"})`}
        </Button>
      </div>
    </form>
  );
}
