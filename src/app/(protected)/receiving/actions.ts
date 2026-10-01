"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReceivingFormState = { error: string | null; success: string | null };

const logReceivingSchema = z.object({
  orderId: z.string().uuid(),
  quantityReceived: z.coerce.number().positive("Enter a quantity greater than zero."),
  conditionNotes: z.string().trim(),
  receivedDate: z.string().min(1, "Pick the date this delivery arrived."),
  invoiceNumber: z.string().trim().min(1, "Enter the invoice number for this delivery."),
});

/**
 * Logs a (possibly partial) delivery against an order via the
 * log_receiving RPC — see supabase/migrations/0003_receiving.sql for why
 * this is a single atomic Postgres function rather than two client calls.
 */
export async function logReceiving(
  _prev: ReceivingFormState,
  formData: FormData,
): Promise<ReceivingFormState> {
  await requireUser();

  const parsed = logReceivingSchema.safeParse({
    orderId: formData.get("order_id"),
    quantityReceived: formData.get("quantity_received"),
    conditionNotes: formData.get("condition_notes") ?? "",
    receivedDate: formData.get("received_date"),
    invoiceNumber: formData.get("invoice_number") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
      success: null,
    };
  }

  const { orderId, quantityReceived, conditionNotes, receivedDate, invoiceNumber } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_receiving", {
    p_order_id: orderId,
    p_quantity_received: quantityReceived,
    p_condition_notes: conditionNotes || null,
    p_received_date: receivedDate,
    p_invoice_number: invoiceNumber,
  });

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/receiving");
  revalidatePath("/orders");
  return { error: null, success: "Delivery logged." };
}
