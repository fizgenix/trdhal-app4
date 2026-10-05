"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";
import { normalizeName } from "@/lib/fuzzy";
import { canonicalUnit } from "@/lib/units";

export type OrderFormState = { error: string | null; success: string | null };

const newOrderSchema = z.object({
  siteId: z.string().min(1),
  poNumber: z.string().trim().min(1, "Enter the PO number for this order."),
  itemId: z.string().min(1),
  newItemName: z.string().trim(),
  // The order's unit. Standardised so a typed "Kgs" / "kilograms" lands as "kg".
  unit: z.string().trim().min(1, "Choose the unit for this order.").transform(canonicalUnit),
  shopkeeperId: z.string().min(1),
  newShopkeeperName: z.string().trim(),
  newShopkeeperPhone: z.string().trim(),
  quantityOrdered: z.coerce.number().positive("Enter a quantity greater than zero."),
});

/**
 * Creates an order. Handles the "add a new item / vendor inline"
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
    poNumber: formData.get("po_number") ?? "",
    itemId: formData.get("item_id"),
    newItemName: formData.get("new_item_name") ?? "",
    // Unit picker posts the chosen unit, or "__new__" plus the typed one.
    unit:
      (formData.get("unit_id") === "__new__" ? formData.get("unit_new") : formData.get("unit_id")) ??
      "",
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
  if (itemId === "__new__" && !data.newItemName) {
    return { error: "Enter a name for the new item.", success: null };
  }
  let shopkeeperId = data.shopkeeperId;
  if (shopkeeperId === "__new__" && !data.newShopkeeperName) {
    return { error: "Enter a name for the new vendor.", success: null };
  }

  // A "new" name that only differs from a saved one by case, spacing or
  // punctuation reuses the saved one rather than creating a duplicate
  // (the picker catches this too; this covers stale lists / races).
  const [existingItems, existingShopkeepers] = await Promise.all([
    itemId === "__new__"
      ? supabase.from("items").select("id, name").then((r) => r.data ?? [])
      : [],
    shopkeeperId === "__new__"
      ? supabase.from("shopkeepers").select("id, name").then((r) => r.data ?? [])
      : [],
  ]);

  if (itemId === "__new__") {
    const match = existingItems.find(
      (i) => normalizeName(i.name) === normalizeName(data.newItemName),
    );
    if (match) itemId = match.id;
  }
  if (shopkeeperId === "__new__") {
    const match = existingShopkeepers.find(
      (s) => normalizeName(s.name) === normalizeName(data.newShopkeeperName),
    );
    if (match) shopkeeperId = match.id;
  }

  if (itemId === "__new__") {
    const { data: newItem, error: itemError } = await supabase
      .from("items")
      // items.unit is the item's usual unit — what the next order pre-fills.
      .insert({ name: data.newItemName, unit: data.unit, created_by: user.id })
      .select("id")
      .single();
    if (itemError || !newItem) {
      return { error: itemError?.message ?? "Could not create the new item.", success: null };
    }
    itemId = newItem.id;
  }

  if (shopkeeperId === "__new__") {
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
        error: shopkeeperError?.message ?? "Could not create the new vendor.",
        success: null,
      };
    }
    shopkeeperId = newShopkeeper.id;
  }

  const { error: orderError } = await supabase
    .from("orders")
    .insert({
      po_number: data.poNumber,
      site_id: data.siteId,
      item_id: itemId,
      shopkeeper_id: shopkeeperId,
      quantity_ordered: data.quantityOrdered,
      unit: data.unit,
      placed_by: user.id,
    });

  if (orderError) {
    // 23505 = unique_violation on orders_po_number_key.
    if (orderError.code === "23505") {
      return {
        error: `PO number ${data.poNumber} is already used by another order.`,
        success: null,
      };
    }
    return { error: orderError.message, success: null };
  }

  revalidatePath("/orders");
  const success = `Order placed — ${data.poNumber}.`;
  await flashToast(success);
  return { error: null, success };
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

  if (!orderId || !Number.isFinite(quantityOrdered) || quantityOrdered <= 0) {
    await flashToast("Enter a quantity greater than zero.", "error");
    return;
  }

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, placed_by, status, quantity_ordered")
    .eq("id", orderId)
    .single();

  if (!order || order.status !== "placed") {
    await flashToast("This order can no longer be edited.", "error");
    return;
  }
  if (!user.isAdmin && order.placed_by !== user.id) {
    await flashToast("Only the person who placed this order can edit it.", "error");
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({ quantity_ordered: quantityOrdered })
    .eq("id", orderId);

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  await supabase.from("order_edit_log").insert({
    order_id: orderId,
    edited_by: user.id,
    action: "edited",
    note: note || null,
    previous_values: { quantity_ordered: order.quantity_ordered },
  });

  revalidatePath("/orders");
  await flashToast(`Order updated — quantity is now ${quantityOrdered}.`);
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

  if (!order || order.status !== "placed") {
    await flashToast("This order can no longer be cancelled.", "error");
    return;
  }
  if (!user.isAdmin && order.placed_by !== user.id) {
    await flashToast("Only the person who placed this order can cancel it.", "error");
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  await supabase.from("order_edit_log").insert({
    order_id: orderId,
    edited_by: user.id,
    action: "cancelled",
    note: note || null,
    previous_values: { status: "placed" },
  });

  revalidatePath("/orders");
  await flashToast("Order cancelled.");
}
