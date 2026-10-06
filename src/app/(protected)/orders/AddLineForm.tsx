"use client";

import { useActionState, useState } from "react";
import { addOrderLine, type OrderFormState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { OrderLineFields, type OrderItemOption } from "./OrderLineFields";

const initialState: OrderFormState = { error: null, success: null };

/** Adds one more item line to an already-placed PO. */
export function AddLineForm({
  purchaseOrderId,
  items,
}: {
  purchaseOrderId: string;
  items: OrderItemOption[];
}) {
  const [state, formAction, isPending] = useActionState(addOrderLine, initialState);
  const [formKey, setFormKey] = useState(0);

  // Same render-time reset pattern as NewOrderForm.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success) setFormKey((k) => k + 1);
  }

  return (
    <form key={formKey} action={formAction} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId} />
      <input type="hidden" name="line_keys" value="0" />
      <OrderLineFields lineKey={0} items={items} savedWhen="you add the item" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Field label="Reason (optional)" name="note" placeholder="e.g. missed on the PO" />
        </div>
        <Button type="submit" variant="secondary" loading={isPending}>
          {isPending ? "Adding…" : "Add item"}
        </Button>
      </div>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
