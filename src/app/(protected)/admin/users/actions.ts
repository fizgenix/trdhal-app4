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
  const me = await requireAdmin();

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

  // Usually means the browser autofilled the Admin's own saved login.
  if (me.email && email.toLowerCase() === me.email.toLowerCase()) {
    return {
      error: "That's your own login email — enter the new person's email and a temporary password.",
      success: null,
    };
  }

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

  // They'll be made to replace the temporary password on first sign-in.
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ must_change_password: true, ...(phone ? { phone } : {}) })
    .eq("id", data.user.id);

  revalidatePath("/admin/users");
  const success = `${fullName} can now sign in with ${email} and the temporary password, then set their own.`;
  await flashToast(success);
  return { error: null, success };
}

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Temporary password must be at least 8 characters."),
});

/**
 * For a forgotten password: Admin sets a new temporary one and tells the
 * person in person. The user is signed out everywhere and must choose their
 * own password on next sign-in, so the Admin never knows the final one.
 */
export async function resetUserPassword(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const me = await requireAdmin();

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get("user_id"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: null };
  }
  const { userId, password } = parsed.data;

  if (userId === me.id) {
    return { error: "Use Account → Change password for your own login.", success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return { error: error.message, success: null };
  }

  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await admin.rpc("revoke_user_sessions", { target: userId });

  revalidatePath("/admin/users");
  const success = "Temporary password set. They'll choose their own at next sign-in.";
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

/**
 * Deletes a login. Someone with no history is removed outright. Anyone who
 * has placed, received, approved or released anything is referenced by those
 * records, so the database refuses the delete — instead they're banned from
 * signing in, signed out everywhere, stripped of site access and marked
 * inactive, keeping their name on past records.
 */
export async function deleteUser(formData: FormData) {
  const me = await requireAdmin();

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return;

  if (userId === me.id) {
    await flashToast("You can't delete your own login.", "error");
    return;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();
  const name = profile?.full_name ?? "User";

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h", // ~100 years
    });
    if (banError) {
      await flashToast(banError.message, "error");
      return;
    }
    await admin.rpc("revoke_user_sessions", { target: userId });
    await admin.from("user_sites").delete().eq("user_id", userId);
    await admin.from("profiles").update({ is_active: false }).eq("id", userId);

    revalidatePath("/admin/users");
    await flashToast(`${name}'s login was removed. Their name stays on past records.`);
    return;
  }

  revalidatePath("/admin/users");
  await flashToast(`${name} was deleted.`);
}
