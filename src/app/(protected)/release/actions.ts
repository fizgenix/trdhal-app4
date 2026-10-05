"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/fuzzy";
import { flashToast } from "@/lib/toast";

export type ReleaseFormState = { error: string | null; success: string | null };

const releaseSchema = z.object({
  siteId: z.string().uuid(),
  itemId: z.string().uuid("Choose an item to release."),
  unit: z.string().trim().min(1, "Choose an item to release."),
  quantityReleased: z.coerce.number().positive("Enter a quantity greater than zero."),
  destinationBuildingId: z.string().min(1),
  newBuildingName: z.string().trim(),
  qualityNotes: z.string().trim(),
});

/**
 * Releases inventory via the release_inventory RPC — see
 * supabase/migrations/0005_release.sql for why the availability check and
 * the insert have to happen together as one atomic, lock-guarded step
 * rather than a client-side check followed by a plain insert.
 */
export async function releaseInventory(
  _prev: ReleaseFormState,
  formData: FormData,
): Promise<ReleaseFormState> {
  const user = await requireUser();

  const parsed = releaseSchema.safeParse({
    siteId: formData.get("site_id"),
    itemId: formData.get("item_id"),
    unit: formData.get("unit") ?? "",
    quantityReleased: formData.get("quantity_released"),
    destinationBuildingId: formData.get("destination_building_id"),
    newBuildingName: formData.get("new_building_name") ?? "",
    qualityNotes: formData.get("quality_notes") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the details and try again.",
      success: null,
    };
  }

  const data = parsed.data;

  const canRelease =
    user.isAdmin ||
    user.siteAssignments.some(
      (a) => a.site_id === data.siteId && a.role === "ho2_receiving",
    );

  if (!canRelease) {
    return { error: "You do not have receiving access at this site.", success: null };
  }

  const supabase = await createClient();

  let destinationBuildingId = data.destinationBuildingId;
  if (destinationBuildingId === "__new__" && !data.newBuildingName) {
    return { error: "Enter a name for the new building.", success: null };
  }

  // A "new" building whose name only differs from one already at this site
  // by case, spacing or punctuation reuses it instead of duplicating it.
  if (destinationBuildingId === "__new__") {
    const { data: siteBuildings } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("site_id", data.siteId);
    const match = (siteBuildings ?? []).find(
      (b) => normalizeName(b.name) === normalizeName(data.newBuildingName),
    );
    if (match) destinationBuildingId = match.id;
  }

  if (destinationBuildingId === "__new__") {
    const { data: newBuilding, error: buildingError } = await supabase
      .from("buildings")
      .insert({ site_id: data.siteId, name: data.newBuildingName, created_by: user.id })
      .select("id")
      .single();
    if (buildingError || !newBuilding) {
      return {
        error: buildingError?.message ?? "Could not create the new building.",
        success: null,
      };
    }
    destinationBuildingId = newBuilding.id;
  }

  const { error } = await supabase.rpc("release_inventory", {
    p_site_id: data.siteId,
    p_item_id: data.itemId,
    p_unit: data.unit,
    p_quantity_released: data.quantityReleased,
    p_quality_notes: data.qualityNotes || null,
    p_destination_building_id: destinationBuildingId,
  });

  if (error) {
    return { error: error.message, success: null };
  }

  revalidatePath("/release");
  await flashToast("Inventory released.");
  return { error: null, success: "Inventory released." };
}
