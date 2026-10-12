"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { logDirectReceipt, type ReceivingFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
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
}: {
  siteId: string;
  items: OrderItemOption[];
  shopkeepers: Shopkeeper[];
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
    <form
      key={formKey}
      action={formAction}
      className="grid gap-4 rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:grid-cols-2"
    >
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="line_keys" value={lineKeys.join(",")} />

      <div className="sm:col-span-2">
        <CardHeaderBand>Direct Receipt</CardHeaderBand>
        <p className="mt-2 text-xs text-[#7b8494]">
          For misc items that arrive with no purchase order. They go to Approvals and are
          added to stock only once approved.
        </p>
      </div>

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
        label="Received date"
        name="received_date"
        type="date"
        defaultValue={today}
        max={today}
        required
      />

      <Field label="Invoice / bill number (optional)" name="invoice_number" placeholder="e.g. INV-2231" />

      <div className="flex flex-col gap-3 border-t border-brand-border-soft pt-4 sm:col-span-2">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
          Items received ({lineKeys.length})
        </p>
        {lineKeys.map((key, i) => (
          <div
            key={key}
            className={i > 0 ? "border-t border-dashed border-brand-border-soft pt-3" : ""}
          >
            <OrderLineFields
              lineKey={key}
              items={items}
              savedWhen="you log this receipt"
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
            ? "Saving… please wait"
            : `Log & send for approval (${lineKeys.length} item${lineKeys.length === 1 ? "" : "s"})`}
        </Button>
      </div>
    </form>
  );
}
