"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";
import { lineSchema, readLines, resolveItemIds, resolveNewShopkeeper } from "@/lib/order-lines";

/** Today as YYYY-MM-DD in India time — the business's timezone. */
function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export type ReceivingFormState = { error: string | null; success: string | null };

const logReceivingSchema = z.object({
  orderId: z.string().uuid(),
  quantityReceived: z.coerce.number().positive("Enter a quantity greater than zero."),
  conditionNotes: z.string().trim(),
  receivedDate: z
    .string()
    .min(1, "Pick the date this delivery arrived.")
    .refine((d) => d <= todayInIndia(), "The received date can't be in the future."),
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
  await flashToast("Delivery logged.");
  return { error: null, success: "Delivery logged." };
}

const directReceiptSchema = z.object({
  siteId: z.string().uuid(),
  shopkeeperId: z.string().min(1, "Choose the vendor these items came from."),
  newShopkeeperName: z.string().trim(),
  receivedDate: z
    .string()
    .min(1, "Pick the date these items arrived.")
    .refine((d) => d <= todayInIndia(), "The received date can't be in the future."),
  invoiceNumber: z.string().trim(),
  lines: z.array(lineSchema).min(1, "Add at least one item."),
});

/**
 * Logs misc items that arrived with no purchase order, via the
 * log_direct_receipt RPC (0016_direct_receipts.sql): it creates a MISC-
 * numbered PO whose lines go straight to HO3 for approval, so they reach
 * stock only once approved. New items / vendors typed in are saved first.
 */
export async function logDirectReceipt(
  _prev: ReceivingFormState,
  formData: FormData,
): Promise<ReceivingFormState> {
  const user = await requireUser();

  const parsed = directReceiptSchema.safeParse({
    siteId: formData.get("site_id"),
    shopkeeperId: formData.get("shopkeeper_id") ?? "",
    newShopkeeperName: formData.get("new_shopkeeper_name") ?? "",
    receivedDate: formData.get("received_date"),
    invoiceNumber: formData.get("invoice_number") ?? "",
    lines: readLines(formData),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
      success: null,
    };
  }

  const data = parsed.data;

  const canReceive =
    user.isAdmin ||
    user.siteAssignments.some((a) => a.site_id === data.siteId && a.role === "ho2_receiving");
  if (!canReceive) {
    return { error: "You do not have receiving access at this site.", success: null };
  }

  const supabase = await createClient();

  const { itemIds, error: itemError } = await resolveItemIds(supabase, user.id, data.lines);
  if (itemError) return { error: itemError, success: null };

  let shopkeeperId = data.shopkeeperId;
  if (shopkeeperId === "__new__") {
    const resolved = await resolveNewShopkeeper(supabase, user.id, data.newShopkeeperName, "");
    if (resolved.id === null) return { error: resolved.error, success: null };
    shopkeeperId = resolved.id;
  }

  const { data: po, error } = await supabase
    .rpc("log_direct_receipt", {
      p_site_id: data.siteId,
      p_shopkeeper_id: shopkeeperId,
      p_received_date: data.receivedDate,
      p_invoice_number: data.invoiceNumber || null,
      p_notes: null,
      p_lines: data.lines.map((line, i) => ({
        item_id: itemIds[i],
        quantity: line.quantityOrdered,
        unit: line.unit,
      })),
    })
    .single<{ po_number: string }>();

  if (error) return { error: error.message, success: null };

  revalidatePath("/receiving");
  revalidatePath("/approvals");
  const count = data.lines.length;
  const success = `Direct receipt ${po?.po_number ?? ""} logged (${count} item${count === 1 ? "" : "s"}) — sent for approval.`;
  await flashToast(success);
  return { error: null, success };
}
