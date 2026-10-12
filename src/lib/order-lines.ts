import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/fuzzy";
import { canonicalUnit } from "@/lib/units";

/**
 * Item lines posted by OrderLineFields, and saving the new items / vendors
 * typed into its pickers. Shared by placing a PO (orders/actions.ts) and
 * logging a direct receipt (receiving/actions.ts).
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const lineSchema = z.object({
  itemId: z.string().min(1, "Choose an item for every line."),
  newItemName: z.string().trim(),
  // The line's unit. Standardised so a typed "Kgs" / "kilograms" lands as "kg".
  unit: z.string().trim().min(1, "Choose the unit for every item.").transform(canonicalUnit),
  quantityOrdered: z.coerce.number().positive("Enter a quantity greater than zero for every item."),
});

export type OrderLineInput = z.infer<typeof lineSchema>;

/**
 * Reads the item lines posted by OrderLineFields. `line_keys` lists the
 * keys of the rows on screen ("0,2,3" after row 1 was removed); each row's
 * fields carry its key as a suffix, e.g. `quantity_ordered_2`.
 */
export function readLines(formData: FormData) {
  const keys = String(formData.get("line_keys") ?? "")
    .split(",")
    .filter(Boolean);
  return keys.map((k) => ({
    itemId: formData.get(`item_id_${k}`) ?? "",
    newItemName: formData.get(`new_item_name_${k}`) ?? "",
    // Unit picker posts the chosen unit, or "__new__" plus the typed one.
    unit:
      (formData.get(`unit_id_${k}`) === "__new__"
        ? formData.get(`unit_new_${k}`)
        : formData.get(`unit_id_${k}`)) ?? "",
    quantityOrdered: formData.get(`quantity_ordered_${k}`),
  }));
}

/**
 * Turns each line's "add a new item inline" choice (itemId === '__new__')
 * into a real item id: reuses a saved item whose name only differs by
 * case, spacing or punctuation (the picker catches this too; this covers
 * stale lists / races), otherwise inserts it. The same new name on two
 * lines creates the item once.
 */
export async function resolveItemIds(
  supabase: Supabase,
  userId: string,
  lines: OrderLineInput[],
): Promise<{ itemIds: string[]; error: string | null }> {
  if (lines.some((l) => l.itemId === "__new__" && !l.newItemName)) {
    return { itemIds: [], error: "Enter a name for the new item." };
  }
  if (!lines.some((l) => l.itemId === "__new__")) {
    return { itemIds: lines.map((l) => l.itemId), error: null };
  }

  const { data } = await supabase.from("items").select("id, name");
  const known = new Map((data ?? []).map((i) => [normalizeName(i.name), i.id as string]));

  const itemIds: string[] = [];
  for (const line of lines) {
    if (line.itemId !== "__new__") {
      itemIds.push(line.itemId);
      continue;
    }
    const key = normalizeName(line.newItemName);
    let id = known.get(key);
    if (!id) {
      const { data: newItem, error } = await supabase
        .from("items")
        // items.unit is the item's usual unit — what the next order pre-fills.
        .insert({ name: line.newItemName, unit: line.unit, created_by: userId })
        .select("id")
        .single();
      if (error || !newItem) {
        return { itemIds: [], error: error?.message ?? "Could not create the new item." };
      }
      id = newItem.id as string;
      known.set(key, id);
    }
    itemIds.push(id);
  }
  return { itemIds, error: null };
}

/**
 * A vendor typed into the picker as new: reuses a saved vendor whose name
 * only differs by case, spacing or punctuation, otherwise inserts it.
 */
export async function resolveNewShopkeeper(
  supabase: Supabase,
  userId: string,
  name: string,
  phone: string,
): Promise<{ id: string; error: null } | { id: null; error: string }> {
  if (!name) return { id: null, error: "Enter a name for the new vendor." };

  const { data: existingShopkeepers } = await supabase.from("shopkeepers").select("id, name");
  const match = (existingShopkeepers ?? []).find(
    (s) => normalizeName(s.name) === normalizeName(name),
  );
  if (match) return { id: match.id as string, error: null };

  const { data: newShopkeeper, error } = await supabase
    .from("shopkeepers")
    .insert({ name, phone: phone || null, created_by: userId })
    .select("id")
    .single();
  if (error || !newShopkeeper) {
    return { id: null, error: error?.message ?? "Could not create the new vendor." };
  }
  return { id: newShopkeeper.id as string, error: null };
}
