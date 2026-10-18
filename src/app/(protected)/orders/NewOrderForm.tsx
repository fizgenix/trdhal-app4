"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createOrder, type OrderFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { NEW_ID, SearchableSelect } from "@/components/ui/SearchableSelect";
import { OrderLineFields, type OrderItemOption } from "./OrderLineFields";

type Shopkeeper = { id: string; name: string };

const initialState: OrderFormState = { error: null, success: null };

/** Today's date in the browser's own timezone, as YYYY-MM-DD. */
function localToday() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const noopSubscribe = () => () => {};

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
  // Read in the browser — see useToday() in receiving/LogReceivingForm.
  const today = useSyncExternalStore(noopSubscribe, localToday, () => undefined);
  const [isNewShopkeeper, setIsNewShopkeeper] = useState(false);
  const [minimised, setMinimised] = useState(false);
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
    <section className="rounded-2xl border border-brand-border bg-white shadow-sm">
      <div
        className={`flex items-center justify-between gap-3 bg-brand-cream px-5 py-3 ${
          minimised ? "rounded-2xl" : "rounded-t-2xl border-b border-brand-border-soft"
        }`}
      >
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-brand-navy">
          Place a new order
        </h2>
        <button
          type="button"
          onClick={() => setMinimised((m) => !m)}
          aria-expanded={!minimised}
          className="rounded-lg border border-brand-border bg-white px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-content"
        >
          {minimised ? "+ Expand" : "— Minimise"}
        </button>
      </div>

      {/* Hidden rather than unmounted, so a half-filled order survives
          minimising. */}
      <form
        key={formKey}
        action={formAction}
        hidden={minimised}
        className="flex flex-col gap-4 p-5"
      >
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="line_keys" value={lineKeys.join(",")} />

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)_minmax(0,2.2fr)]">
          <Field label="PO Number" name="po_number" placeholder="e.g. PO-00123" required />

          <Field
            label="Order date"
            name="placed_date"
            type="date"
            defaultValue={today}
            // Orders can't be dated ahead — future days are greyed out in the
            // picker (also enforced in createOrder and the DB).
            max={today}
            required
          />

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
          <div className="sm:max-w-sm">
            <Field
              label="New vendor's phone (optional)"
              name="new_shopkeeper_phone"
              type="tel"
              placeholder="+91 90000 00000"
            />
          </div>
        )}

        <div className="rounded-xl border border-brand-border-soft">
          {/* Column names for the item rows — on phones each field keeps
              its own label instead. */}
          <div className="grid grid-cols-1 gap-3 rounded-t-xl border-b border-brand-border-soft bg-brand-cream px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553] sm:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,2fr)_78px]">
            <div>Items on this PO ({lineKeys.length})</div>
            <div className="hidden sm:block">Quantity</div>
            <div className="hidden sm:block">Unit</div>
            <div className="hidden sm:block">Description (optional)</div>
          </div>
          <div className="divide-y divide-dashed divide-brand-border-soft">
            {lineKeys.map((key) => (
              <div key={key} className="p-3">
                <OrderLineFields
                  lineKey={key}
                  items={items}
                  withDescription
                  inline
                  onRemove={
                    lineKeys.length > 1
                      ? () => setLineKeys((keys) => keys.filter((k) => k !== key))
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addLine}
            className="self-start rounded-full border border-brand-border px-4 py-2 text-sm font-bold text-brand-navy hover:bg-brand-cream"
          >
            + Add another item
          </button>
          <Button type="submit" loading={isPending}>
            {isPending
              ? "Placing order… please wait"
              : `Place order (${lineKeys.length} item${lineKeys.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </form>
    </section>
  );
}
