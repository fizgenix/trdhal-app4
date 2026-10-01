"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createSite(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  if (!name) return;

  const supabase = await createClient();
  await supabase.from("sites").insert({ name, location: location || null });

  revalidatePath("/admin/sites");
  revalidatePath("/dashboard");
}
