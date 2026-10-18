"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui/Button";
import { logReceiving, type ReceivingFormState } from "./actions";

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
 * Today's date, read in the browser rather than during server rendering —
 * the server's clock/timezone can differ from the user's, which would put
 * the date picker's limit on the wrong day.
 */
function useToday() {
  return useSyncExternalStore(noopSubscribe, localToday, () => undefined);
}

/** The Receive tab of an open item on the Receiving page: one delivery's details. */
export function LogReceivingForm({
  orderId,
  itemUnit,
  orderDate,
  remainingQuantity,
}: {
  orderId: string;
  itemUnit?: string;
  /** The PO's order date, YYYY-MM-DD in India time — the earliest received date allowed. */
  orderDate: string;
  remainingQuantity: number;
}) {
  const [state, formAction, isPending] = useActionState(logReceiving, initialState);
  const today = useToday();
  const [formKey, setFormKey] = useState(0);
  const [quantity, setQuantity] = useState("");

  // Same render-time reset pattern as NewOrderForm — see the comment
  // there for why this runs during render instead of in a useEffect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) {
      setFormKey((k) => k + 1);
      setQuantity("");
    }
  }

  // Over-receiving is allowed (vendors do send extra) — warned, not blocked.
  const overBy = Number(quantity) - Math.max(remainingQuantity, 0);
  const inputClass =
    "w-full rounded-lg border border-brand-input-border bg-white px-2.5 py-2 text-sm text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40";

  const labelClass = "text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]";

  return (
    <form
      key={formKey}
      action={formAction}
      className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.4fr)_auto]"
    >
      <input type="hidden" name="order_id" value={orderId} />

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Qty</span>
        <input
          name="quantity_received"
          type="number"
          step="0.01"
          min="0.01"
          placeholder={remainingQuantity > 0 ? `Qty (${Number(remainingQuantity.toFixed(2))} left)` : "Extra qty"}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className={`${inputClass} ${overBy > 0 ? "border-red-400 bg-red-50" : ""}`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Date</span>
        <input
          name="received_date"
          type="date"
          defaultValue={today}
          // Deliveries can't be logged ahead of time or before the order
          // date — those days are greyed out in the picker. logReceiving
          // re-checks the future limit and the DB enforces both.
          min={orderDate}
          max={today}
          required
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Invoice</span>
        <input name="invoice_number" type="text" placeholder="Invoice #" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Notes</span>
        <input name="condition_notes" type="text" placeholder="Optional" className={inputClass} />
      </label>

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-navy px-5 py-2.5 text-sm font-bold text-brand-gold-text hover:bg-brand-navy-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <>
            <Spinner className="h-3 w-3" />
            Saving…
          </>
        ) : (
          "Log delivery"
        )}
      </button>

      {overBy > 0 && (
        <p className="col-span-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          ▲ This is {Number(overBy.toFixed(2))} {itemUnit} more than ordered
          {remainingQuantity > 0
            ? ` (only ${Number(remainingQuantity.toFixed(2))} ${itemUnit} left to receive)`
            : " — this line is already fully received"}
          . You can still log it; it will be flagged as over-received for the order and
          approval teams.
        </p>
      )}

      {state.error && (
        <p className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
