"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";

export async function createSite(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!name) {
    await flashToast("Enter a name for the site.", "error");
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({ name, location: location || null });

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  revalidatePath("/admin/sites");
  revalidatePath("/dashboard");
  await flashToast(`Site "${name}" created.`);
}
