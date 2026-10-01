"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ApprovalFormState = { error: string | null; success: string | null };

const approveOrderSchema = z.object({
  orderId: z.string().uuid(),
  remarks: z.string().trim(),
});

/**
 * Approves an order via the approve_order RPC — see
 * supabase/migrations/0004_approvals.sql for why this is one atomic
 * Postgres function (inserting the approval and flipping the order to
 * 'completed' must happen together, and it re-checks received >= ordered
 * server-side rather than trusting the UI's own check).
 */
export async function approveOrder(
  _prev: ApprovalFormState,
  formData: FormData,
): Promise<ApprovalFormState> {
  await requireUser();

  const parsed = approveOrderSchema.safeParse({
    orderId: formData.get("order_id"),
    remarks: formData.get("remarks") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
      success: null,
    };
  }

  const { orderId, remarks } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_order", {
    p_order_id: orderId,
    p_remarks: remarks || null,
  });

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/approvals");
  revalidatePath("/orders");
  revalidatePath("/receiving");
  return { error: null, success: "Order approved and completed." };
}
