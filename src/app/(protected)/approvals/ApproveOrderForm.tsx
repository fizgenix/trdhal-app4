"use client";

import { useActionState, useState } from "react";
import { approveOrder, type ApprovalFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: ApprovalFormState = { error: null, success: null };

/**
 * One approval action on a line: approve what's been received but not yet
 * approved, or (`closeShort`) accept a short delivery as final and close
 * the line — remarks are required for that.
 */
export function ApproveOrderForm({
  orderId,
  closeShort = false,
  label,
  remarksPlaceholder = "e.g. matches delivery challan, all good",
}: {
  orderId: string;
  closeShort?: boolean;
  label: string;
  remarksPlaceholder?: string;
}) {
  const [state, formAction, isPending] = useActionState(approveOrder, initialState);
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern used by NewOrderForm / LogReceivingForm.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="close_short" value={String(closeShort)} />
      <div className="min-w-56 flex-1">
        <Field
          label={closeShort ? "Reason for closing short (required)" : "Remarks (optional)"}
          id={`${closeShort ? "short" : "approve"}-remarks-${orderId}`}
          name="remarks"
          placeholder={remarksPlaceholder}
          required={closeShort}
        />
      </div>
      <Button type="submit" variant={closeShort ? "danger" : "primary"} loading={isPending}>
        {isPending ? "Saving… please wait" : label}
      </Button>

      {state.error && (
        <p className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
