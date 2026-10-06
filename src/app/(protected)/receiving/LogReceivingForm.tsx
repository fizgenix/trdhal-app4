"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui/Button";
import { logReceiving, type ReceivingFormState } from "./actions";
import { OverReceivedBadge } from "@/components/OverReceivedBadge";

const initialState: ReceivingFormState = { error: null, success: null };

const ROW_GRID =
  "grid grid-cols-[44px_1.3fr_0.9fr_0.8fr_0.8fr_0.9fr_1fr_auto] items-center gap-2.5 px-5 py-3.5";

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

/** `percent` can pass 100 on an over-received line — the ring turns red and shows it. */
function ProgressRing({ percent }: { percent: number }) {
  const color =
    percent > 100
      ? "#dc2626"
      : percent >= 100
      ? "var(--color-status-completed)"
      : percent > 0
        ? "var(--color-status-pending)"
        : "#e5e7eb";
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-[#d3cbb9] text-[9px] font-bold text-brand-navy"
      style={{
        background: `conic-gradient(${color} ${Math.min(percent, 100) * 3.6}deg, #efebe2 ${Math.min(percent, 100) * 3.6}deg 360deg)`,
      }}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
        {percent}%
      </span>
    </div>
  );
}

export function LogReceivingForm({
  orderId,
  itemName,
  itemUnit,
  quantityOrdered,
  receivedSoFar,
  remainingQuantity,
}: {
  orderId: string;
  itemName: string;
  itemUnit?: string;
  quantityOrdered: number;
  receivedSoFar: number;
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

  const percent = Math.round((receivedSoFar / quantityOrdered) * 100);
  // Over-receiving is allowed (vendors do send extra) — warned, not blocked.
  const overBy = Number(quantity) - Math.max(remainingQuantity, 0);
  const inputClass =
    "w-full rounded-lg border border-brand-input-border px-2.5 py-2 text-xs text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40";

  return (
    <form key={formKey} action={formAction} className={ROW_GRID}>
      <input type="hidden" name="order_id" value={orderId} />

      <ProgressRing percent={percent} />

      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-brand-navy">
          {itemName}{" "}
          {itemUnit && (
            <span className="font-normal text-gray-400">({itemUnit})</span>
          )}
        </div>
        <OverReceivedBadge
          ordered={quantityOrdered}
          received={receivedSoFar}
          unit={itemUnit ?? ""}
        />
      </div>

      <div
        className={`text-xs ${receivedSoFar > quantityOrdered ? "font-bold text-red-700" : "text-[#6b7280]"}`}
      >
        {quantityOrdered} / {receivedSoFar}
      </div>

      <input
        name="quantity_received"
        type="number"
        step="0.01"
        min="0.01"
        placeholder={remainingQuantity > 0 ? `Qty (${remainingQuantity} left)` : "Extra qty"}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
        className={`${inputClass} ${overBy > 0 ? "border-red-400 bg-red-50" : ""}`}
      />

      <input
        name="received_date"
        type="date"
        defaultValue={today}
        // Deliveries can't be logged ahead of time — future days are greyed
        // out in the picker (also enforced in logReceiving and the DB).
        max={today}
        required
        className={inputClass}
      />

      <input
        name="invoice_number"
        type="text"
        placeholder="Invoice #"
        required
        className={inputClass}
      />

      <input
        name="condition_notes"
        type="text"
        placeholder="Notes"
        className={inputClass}
      />

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending || undefined}
        className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy px-3.5 py-2 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        {isPending ? (
          <>
            <Spinner className="h-3 w-3" />
            Saving…
          </>
        ) : (
          "Log"
        )}
      </button>

      {overBy > 0 && (
        <p className="col-span-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          ▲ This is {Number(overBy.toFixed(2))} {itemUnit} more than ordered
          {remainingQuantity > 0
            ? ` (only ${remainingQuantity} ${itemUnit} left to receive)`
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
