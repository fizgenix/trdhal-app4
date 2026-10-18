"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { logDirectReceipt, type ReceivingFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { OrderLineFields, type OrderItemOption } from "../orders/OrderLineFields";

type Shopkeeper = { id: string; name: string };

const initialState: ReceivingFormState = { error: null, success: null };

/** Today's date in the browser's own timezone, as YYYY-MM-DD. */
function localToday() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

const noopSubscribe = () => () => {};

/**
 * Misc items that arrived with no purchase order. Each submit becomes one
 * MISC- numbered receipt whose items go straight to Approvals; they reach
 * stock only once HO3 approves them (0016_direct_receipts.sql).
 */
export function DirectReceiptForm({
  siteId,
  items,
  shopkeepers,
  closeHref,
}: {
  siteId: string;
  items: OrderItemOption[];
  shopkeepers: Shopkeeper[];
  /** Where ✕ goes — the same tab without the form. */
  closeHref: string;
}) {
  const [state, formAction, isPending] = useActionState(logDirectReceipt, initialState);
  // Read in the browser — see useToday() in LogReceivingForm.
  const today = useSyncExternalStore(noopSubscribe, localToday, () => undefined);
  const [formKey, setFormKey] = useState(0);
  // Same never-reused line keys as NewOrderForm.
  const [lineKeys, setLineKeys] = useState([0]);
  const [nextLineKey, setNextLineKey] = useState(1);

  // Same render-time reset pattern as NewOrderForm.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
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
      <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-brand-border-soft bg-brand-cream px-5 py-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-brand-navy">
            New direct receipt
          </h2>
          <p className="mt-0.5 text-xs text-[#7b8494]">
            For misc items that arrive with no purchase order. They go to Approvals and are
            added to stock only once approved.
          </p>
        </div>
        <Link
          href={closeHref}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-white text-brand-navy hover:bg-brand-content"
        >
          ✕
        </Link>
      </div>

      <form key={formKey} action={formAction} className="flex flex-col gap-4 p-5">
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="line_keys" value={lineKeys.join(",")} />

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
          <SearchableSelect
            label="Vendor"
            name="shopkeeper_id"
            newNameField="new_shopkeeper_name"
            noun="vendor"
            required
            placeholder="Search or add a vendor…"
            savedWhen="you log this receipt"
            options={shopkeepers.map((s) => ({ id: s.id, name: s.name, label: s.name }))}
          />

          <Field
            label="Date"
            name="received_date"
            type="date"
            defaultValue={today}
            max={today}
            required
          />

          <Field label="Invoice (optional)" name="invoice_number" placeholder="Invoice #" />

          <Field label="Notes (optional)" name="notes" maxLength={500} placeholder="e.g. bought at site" />
        </div>

        <div className="rounded-xl border border-brand-border-soft">
          {/* Column names for the item rows — on phones each field keeps
              its own label instead. */}
          <div className="grid grid-cols-1 gap-3 rounded-t-xl border-b border-brand-border-soft bg-brand-cream px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_78px]">
            <div>Items received ({lineKeys.length})</div>
            <div className="hidden sm:block">Quantity</div>
            <div className="hidden sm:block">Unit</div>
          </div>
          <div className="divide-y divide-dashed divide-brand-border-soft">
            {lineKeys.map((key) => (
              <div key={key} className="p-3">
                <OrderLineFields
                  lineKey={key}
                  items={items}
                  savedWhen="you log this receipt"
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
              ? "Saving… please wait"
              : `Save receipt (${lineKeys.length} item${lineKeys.length === 1 ? "" : "s"})`}
          </Button>
        </div>
      </form>
    </section>
  );
}
