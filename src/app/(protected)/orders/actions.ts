"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";
import { lineSchema, readLines, resolveItemIds, resolveNewShopkeeper } from "@/lib/order-lines";

export type OrderFormState = { error: string | null; success: string | null };

const newOrderSchema = z.object({
  siteId: z.string().min(1),
  poNumber: z.string().trim().min(1, "Enter the PO number for this order."),
  shopkeeperId: z.string().min(1),
  newShopkeeperName: z.string().trim(),
  newShopkeeperPhone: z.string().trim(),
  lines: z.array(lineSchema).min(1, "Add at least one item to the order."),
});

const addLineSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  note: z.string().trim(),
  lines: z.array(lineSchema).length(1),
});

/**
 * Places a purchase order with one or more item lines. Handles the "add a
 * new item / vendor inline" option by inserting into the master tables
 * first, then writes the PO and all its lines in one go through the
 * create_purchase_order RPC (0012_purchase_orders.sql).
 */
export async function createOrder(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const user = await requireUser();

  const parsed = newOrderSchema.safeParse({
    siteId: formData.get("site_id"),
    poNumber: formData.get("po_number") ?? "",
    shopkeeperId: formData.get("shopkeeper_id"),
    newShopkeeperName: formData.get("new_shopkeeper_name") ?? "",
    newShopkeeperPhone: formData.get("new_shopkeeper_phone") ?? "",
    lines: readLines(formData),
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

  let shopkeeperId = data.shopkeeperId;
  if (shopkeeperId === "__new__" && !data.newShopkeeperName) {
    return { error: "Enter a name for the new vendor.", success: null };
  }

  const supabase = await createClient();

  // Catch a reused PO number before any new item/vendor gets saved. Only
  // worth the extra round trip when something new would be saved — with
  // nothing new, the RPC's unique-violation below reports it the same way.
  const savesNewEntries =
    shopkeeperId === "__new__" || data.lines.some((l) => l.itemId === "__new__");
  if (savesNewEntries) {
    const { data: existingPo } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("po_number", data.poNumber)
      .maybeSingle();
    if (existingPo) {
      return {
        error: `PO number ${data.poNumber} is already used by another order.`,
        success: null,
      };
    }
  }

  const { itemIds, error: itemError } = await resolveItemIds(supabase, user.id, data.lines);
  if (itemError) return { error: itemError, success: null };

  if (shopkeeperId === "__new__") {
    const resolved = await resolveNewShopkeeper(
      supabase,
      user.id,
      data.newShopkeeperName,
      data.newShopkeeperPhone,
    );
    if (resolved.id === null) return { error: resolved.error, success: null };
    shopkeeperId = resolved.id;
  }

  const { error: orderError } = await supabase.rpc("create_purchase_order", {
    p_site_id: data.siteId,
    p_po_number: data.poNumber,
    p_shopkeeper_id: shopkeeperId,
    p_lines: data.lines.map((line, i) => ({
      item_id: itemIds[i],
      quantity_ordered: line.quantityOrdered,
      unit: line.unit,
    })),
  });

  if (orderError) {
    // 23505 = unique_violation on purchase_orders_po_number_key.
    if (orderError.code === "23505") {
      return {
        error: `PO number ${data.poNumber} is already used by another order.`,
        success: null,
      };
    }
    return { error: orderError.message, success: null };
  }

  revalidatePath("/orders");
  const count = data.lines.length;
  const success = `Order placed — ${data.poNumber} (${count} item${count === 1 ? "" : "s"}).`;
  await flashToast(success);
  return { error: null, success };
}

/** Adds a forgotten item to an existing PO via the add_order_line RPC. */
export async function addOrderLine(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const user = await requireUser();

  const parsed = addLineSchema.safeParse({
    purchaseOrderId: formData.get("purchase_order_id"),
    note: formData.get("note") ?? "",
    lines: readLines(formData),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the item details and try again.",
      success: null,
    };
  }

  const { purchaseOrderId, note, lines } = parsed.data;
  const supabase = await createClient();

  // Check ownership before saving a new item — the RPC re-checks it too.
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("placed_by")
    .eq("id", purchaseOrderId)
    .single();
  if (!po) return { error: "Purchase order not found.", success: null };
  if (!user.isAdmin && po.placed_by !== user.id) {
    return { error: "Only the person who placed this PO can add items to it.", success: null };
  }

  const { itemIds, error: itemError } = await resolveItemIds(supabase, user.id, lines);
  if (itemError) return { error: itemError, success: null };

  const { error } = await supabase.rpc("add_order_line", {
    p_purchase_order_id: purchaseOrderId,
    p_item_id: itemIds[0],
    p_quantity_ordered: lines[0].quantityOrdered,
    p_unit: lines[0].unit,
    p_note: note || null,
  });

  if (error) return { error: error.message, success: null };

  revalidatePath("/orders");
  revalidatePath("/receiving");
  await flashToast("Item added to the PO.");
  return { error: null, success: "Item added to the PO." };
}

/**
 * Edits one line's quantity. Only the order's own creator (or Admin), and
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
  revalidatePath("/receiving");
  await flashToast(`Order updated — quantity is now ${quantityOrdered}.`);
}

/**
 * Removes one line from a PO (status -> 'cancelled', logged as 'removed').
 * Same ownership rule as edit. The last remaining line can't be removed —
 * that's cancelling the whole PO, which has its own action.
 */
export async function removeOrderLine(formData: FormData) {
  const user = await requireUser();

  const orderId = String(formData.get("order_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!orderId) return;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, purchase_order_id, placed_by, status")
    .eq("id", orderId)
    .single();

  if (!order || order.status !== "placed") {
    await flashToast("This item can no longer be removed.", "error");
    return;
  }
  if (!user.isAdmin && order.placed_by !== user.id) {
    await flashToast("Only the person who placed this order can remove items.", "error");
    return;
  }

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("purchase_order_id", order.purchase_order_id)
    .neq("status", "cancelled")
    .neq("id", orderId);

  if (!count) {
    await flashToast("This is the only item on the PO — cancel the PO instead.", "error");
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
    action: "removed",
    note: note || null,
    previous_values: { status: "placed" },
  });

  revalidatePath("/orders");
  revalidatePath("/receiving");
  await flashToast("Item removed from the PO.");
}

/**
 * Cancels a whole PO — every line goes to 'cancelled'. Only the PO's
 * creator (or Admin), and only while nothing on it has been received yet.
 */
export async function cancelPurchaseOrder(formData: FormData) {
  const user = await requireUser();

  const purchaseOrderId = String(formData.get("purchase_order_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!purchaseOrderId) return;

  const supabase = await createClient();

  const [{ data: po }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, placed_by")
      .eq("id", purchaseOrderId)
      .single(),
    supabase.from("orders").select("id, status").eq("purchase_order_id", purchaseOrderId),
  ]);

  const openLines = (lines ?? []).filter((l) => l.status !== "cancelled");
  if (!po || openLines.length === 0 || openLines.some((l) => l.status !== "placed")) {
    await flashToast(
      "This PO can no longer be cancelled — deliveries have already been logged.",
      "error",
    );
    return;
  }
  if (!user.isAdmin && po.placed_by !== user.id) {
    await flashToast("Only the person who placed this order can cancel it.", "error");
    return;
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .in(
      "id",
      openLines.map((l) => l.id),
    )
    .eq("status", "placed");

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  await supabase.from("order_edit_log").insert(
    openLines.map((l) => ({
      order_id: l.id,
      edited_by: user.id,
      action: "cancelled",
      note: note || null,
      previous_values: { status: "placed" },
    })),
  );

  revalidatePath("/orders");
  revalidatePath("/receiving");
  await flashToast(`PO ${po.po_number} cancelled.`);
}
