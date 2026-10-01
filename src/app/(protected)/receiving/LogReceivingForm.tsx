"use client";

import { useActionState, useState } from "react";
import { logReceiving, type ReceivingFormState } from "./actions";

const initialState: ReceivingFormState = { error: null, success: null };

const ROW_GRID =
  "grid grid-cols-[44px_1.3fr_0.9fr_0.8fr_0.8fr_0.9fr_1fr_auto] items-center gap-2.5 px-5 py-3.5";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ProgressRing({ percent }: { percent: number }) {
  const color =
    percent >= 100
      ? "var(--color-status-completed)"
      : percent > 0
        ? "var(--color-status-pending)"
        : "#e5e7eb";
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-[#d3cbb9] text-[9px] font-bold text-brand-navy"
      style={{
        background: `conic-gradient(${color} ${percent * 3.6}deg, #efebe2 ${percent * 3.6}deg 360deg)`,
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
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern as NewOrderForm — see the comment
  // there for why this runs during render instead of in a useEffect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setFormKey((k) => k + 1);
  }

  const percent = Math.min(100, Math.round((receivedSoFar / quantityOrdered) * 100));
  const isDone = remainingQuantity <= 0;

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
      </div>

      <div className="text-xs text-[#6b7280]">
        {quantityOrdered} / {receivedSoFar}
      </div>

      <input
        name="quantity_received"
        type="number"
        step="0.01"
        min="0.01"
        max={remainingQuantity}
        placeholder={isDone ? "—" : "Qty"}
        disabled={isDone}
        required
        className="w-full rounded-lg border border-brand-input-border px-2.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-50 disabled:text-gray-300"
      />

      <input
        name="received_date"
        type="date"
        defaultValue={today()}
        disabled={isDone}
        required
        className="w-full rounded-lg border border-brand-input-border px-2.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-50 disabled:text-gray-300"
      />

      <input
        name="invoice_number"
        type="text"
        placeholder={isDone ? "—" : "Invoice #"}
        disabled={isDone}
        required={!isDone}
        className="w-full rounded-lg border border-brand-input-border px-2.5 py-2 text-xs text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-50 disabled:text-gray-300"
      />

      <input
        name="condition_notes"
        type="text"
        placeholder={isDone ? "—" : "Notes"}
        disabled={isDone}
        className="w-full rounded-lg border border-brand-input-border px-2.5 py-2 text-xs text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:bg-gray-50 disabled:text-gray-300"
      />

      <button
        type="submit"
        disabled={isPending || isDone}
        className="rounded-full border border-brand-navy px-3.5 py-2 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
      >
        {isPending ? "…" : "Log"}
      </button>

      {state.error && (
        <p className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="col-span-full rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
          {state.success}
        </p>
      )}
    </form>
  );
}
