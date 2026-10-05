"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { flashToast } from "@/lib/toast";

export type UserFormState = { error: string | null; success: string | null };

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().email("Enter a valid login email."),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  isAdmin: z.boolean(),
});

export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    password: formData.get("password"),
    isAdmin: formData.get("is_admin") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: null };
  }

  const { fullName, email, phone, password, isAdmin } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, is_admin: isAdmin },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Could not create user.", success: null };
  }

  if (phone) {
    const supabase = await createClient();
    await supabase.from("profiles").update({ phone }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
  const success = `${fullName} can now sign in with ${email}.`;
  await flashToast(success);
  return { error: null, success };
}

export async function assignUserToSite(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const siteId = String(formData.get("site_id") ?? "");
  const role = String(formData.get("role") ?? "");

  if (!userId || !siteId || !role) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_sites")
    .upsert(
      { user_id: userId, site_id: siteId, role },
      { onConflict: "user_id,site_id,role" },
    );

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  revalidatePath("/admin/users");
  await flashToast("Site access assigned.");
}

export async function removeUserSiteAssignment(formData: FormData) {
  await requireAdmin();

  const assignmentId = String(formData.get("assignment_id") ?? "");
  if (!assignmentId) return;

  const supabase = await createClient();
  const { error } = await supabase.from("user_sites").delete().eq("id", assignmentId);

  if (error) {
    await flashToast(error.message, "error");
    return;
  }

  revalidatePath("/admin/users");
  await flashToast("Site access removed.");
}
