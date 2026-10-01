"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OrderFormState = { error: string | null; success: string | null };

const newOrderSchema = z.object({
  siteId: z.string().min(1),
  itemId: z.string().min(1),
  newItemName: z.string().trim(),
  newItemUnit: z.string().trim(),
  shopkeeperId: z.string().min(1),
  newShopkeeperName: z.string().trim(),
  newShopkeeperPhone: z.string().trim(),
  quantityOrdered: z.coerce.number().positive("Enter a quantity greater than zero."),
});

/**
 * Creates an order. Handles the "add a new item / shopkeeper inline"
 * option (item_id / shopkeeper_id === '__new__') by inserting into the
 * relevant master table first, then using the new row's id — one form
 * submission, no separate trip to a master-data screen.
 */
export async function createOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const user = await requireUser();

  const parsed = newOrderSchema.safeParse({
    siteId: formData.get("site_id"),
    itemId: formData.get("item_id"),
    newItemName: formData.get("new_item_name") ?? "",
    newItemUnit: formData.get("new_item_unit") ?? "",
    shopkeeperId: formData.get("shopkeeper_id"),
    newShopkeeperName: formData.get("new_shopkeeper_name") ?? "",
    newShopkeeperPhone: formData.get("new_shopkeeper_phone") ?? "",
    quantityOrdered: formData.get("quantity_ordered"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the order details and try again.",
      success: null,
    };
  }

  const data = parsed.data;

  const canOrder =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === data.siteId && a.role === "ho1_ordering",
    );

  if (!canOrder) {
    return { error: "You do not have ordering access at this site.", success: null };
  }

  const supabase = await createClient();

  let itemId = data.itemId;
  if (itemId === "__new__") {
    if (!data.newItemName || !data.newItemUnit) {
      return { error: "Enter a name and a unit for the new item.", success: null };
    }
    const { data: newItem, error: itemError } = await supabase
      .from("items")
      .insert({ name: data.newItemName, unit: data.newItemUnit, created_by: user.id })
      .select("id")
      .single();
    if (itemError || !newItem) {
      return { error: itemError?.message ?? "Could not create the new item.", success: null };
    }
    itemId = newItem.id;
  }

  let shopkeeperId = data.shopkeeperId;
  if (shopkeeperId === "__new__") {
    if (!data.newShopkeeperName) {
      return { error: "Enter a name for the new shopkeeper.", success: null };
    }
    const { data: newShopkeeper, error: shopkeeperError } = await supabase
      .from("shopkeepers")
      .insert({
        name: data.newShopkeeperName,
        phone: data.newShopkeeperPhone || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (shopkeeperError || !newShopkeeper) {
      return {
        error: shopkeeperError?.message ?? "Could not create the new shopkeeper.",
        success: null,
      };
    }
    shopkeeperId = newShopkeeper.id;
  }

  // po_number isn't set here — it's auto-assigned by a column default
  // (see supabase/migrations/0007_po_invoice_numbers.sql), so it's read
  // back below purely to surface it in the confirmation message.
  const { data: newOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      site_id: data.siteId,
      item_id: itemId,
      shopkeeper_id: shopkeeperId,
      quantity_ordered: data.quantityOrdered,
      placed_by: user.id,
    })
    .select("po_number")
    .single();

  if (orderError) {
    return { error: orderError.message, success: null };
  }

  revalidatePath("/orders");
  return {
    error: null,
    success: newOrder?.po_number ? `Order placed — ${newOrder.po_number}.` : "Order placed.",
  };
}

/**
 * Edits an order's quantity. Only the order's own creator (or Admin), and
 * only while status is still 'placed' — enforced here for a clean error
 * path, and again by the orders_update RLS policy as a safety net.
 */
export async function editOrder(formData: FormData) {
  const user = await requireUser();

  const orderId = String(formData.get("order_id") ?? "");
  const quantityOrdered = Number(formData.get("quantity_ordered"));
  const note = String(formData.get("note") ?? "").trim();

  if (!orderId || !Number.isFinite(quantityOrdered) || quantityOrdered <= 0) return;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, placed_by, status, quantity_ordered")
    .eq("id", orderId)
    .single();

  if (!order || order.status !== "placed") return;
  if (!user.isAdmin && order.placed_by !== user.id) return;

  const { error } = await supabase
    .from("orders")
    .update({ quantity_ordered: quantityOrdered })
    .eq("id", orderId);

  if (error) return;

  await supabase.from("order_edit_log").insert({
    order_id: orderId,
    edited_by: user.id,
    action: "edited",
    note: note || null,
    previous_values: { quantity_ordered: order.quantity_ordered },
  });

  revalidatePath("/orders");
}

/** Cancels an order (status -> 'cancelled'). Same ownership rule as edit. */
export async function cancelOrder(formData: FormData) {
  const user = await requireUser();

  const orderId = String(formData.get("order_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!orderId) return;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, placed_by, status")
    .eq("id", orderId)
    .single();

  if (!order || order.status !== "placed") return;
  if (!user.isAdmin && order.placed_by !== user.id) return;

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (error) return;

  await supabase.from("order_edit_log").insert({
    order_id: orderId,
    edited_by: user.id,
    action: "cancelled",
    note: note || null,
    previous_values: { status: "placed" },
  });

  revalidatePath("/orders");
}
