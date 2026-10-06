"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";

export type ApprovalFormState = { error: string | null; success: string | null };

const approveOrderSchema = z
  .object({
    orderId: z.string().uuid(),
    remarks: z.string().trim(),
    closeShort: z.boolean(),
  })
  .refine((d) => !d.closeShort || d.remarks, {
    message: "Add a remark explaining why this item is being closed short.",
  });

/**
 * Approves a line via the approve_order RPC — either everything received
 * but not yet approved (the line completes once it's fully received), or,
 * with close_short, accepts a short delivery as final and completes it.
 * See supabase/migrations/0014_partial_approvals.sql; it's one atomic
 * Postgres function so the approval insert and the status flip happen
 * together, and it re-checks the quantities server-side.
 */
export async function approveOrder(
  _prev: ApprovalFormState,
  formData: FormData,
): Promise<ApprovalFormState> {
  await requireUser();

  const parsed = approveOrderSchema.safeParse({
    orderId: formData.get("order_id"),
    remarks: formData.get("remarks") ?? "",
    closeShort: formData.get("close_short") === "true",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
      success: null,
    };
  }

  const { orderId, remarks, closeShort } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_order", {
    p_order_id: orderId,
    p_remarks: remarks || null,
    p_close_short: closeShort,
  });

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath("/receiving");
  const success = closeShort ? "Item closed short and completed." : "Approved.";
  await flashToast(success);
  return { error: null, success };
}
