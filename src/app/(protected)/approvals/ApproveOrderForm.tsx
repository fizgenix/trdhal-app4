"use client";

import { useActionState, useState } from "react";
import { approveOrder, type ApprovalFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: ApprovalFormState = { error: null, success: null };

export function ApproveOrderForm({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState(approveOrder, initialState);
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern used by NewOrderForm / LogReceivingForm.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setFormKey((k) => k + 1);
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className="mt-4 flex flex-wrap items-end gap-3 border-t border-brand-border-soft pt-4"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <div className="min-w-56 flex-1">
        <Field
          label="Remarks (optional)"
          name="remarks"
          placeholder="e.g. matches delivery challan, all good"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Approving…" : "Approve order"}
      </Button>

      {state.error && (
        <p className="w-full rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="w-full rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {state.success}
        </p>
      )}
    </form>
  );
}
