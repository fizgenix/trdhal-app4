"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { flashToast } from "@/lib/toast";

export type PasswordFormState = { error: string | null; success: string | null };

const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(8, "New password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "The two new passwords don't match." })
  .refine((v) => v.next !== v.current, {
    message: "Choose a new password that's different from the current one.",
  });

/**
 * Used both for the forced first-login step (/set-password, where "current"
 * is the Admin's temporary password) and for a voluntary change from
 * /account. Always asks for the current password, so a device someone left
 * signed in can't be used to take the account over.
 *
 * Uses getCurrentUser rather than requireUser on purpose — requireUser would
 * bounce a must-change user straight back to /set-password.
 */
export async function changePassword(
  _prev: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current_password") ?? "",
    next: formData.get("new_password") ?? "",
    confirm: formData.get("confirm_password") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", success: null };
  }
  const { current, next } = parsed.data;

  if (!user.email) {
    return { error: "Your account has no login email — ask your Admin.", success: null };
  }

  // Check the current password on a throwaway client so the user's real
  // session cookies aren't touched, then drop the extra session it made.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyError) {
    return { error: "Current password is incorrect.", success: null };
  }
  await verifier.auth.signOut({ scope: "local" });

  const admin = createAdminClient();
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    password: next,
  });
  if (updateError) {
    return { error: updateError.message, success: null };
  }

  // profiles is Admin-only under RLS, so clear the flag with the service role.
  await admin
    .from("profiles")
    .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (user.mustChangePassword) {
    await flashToast("Password set. Welcome!");
    redirect("/dashboard");
  }

  const success = "Password updated.";
  await flashToast(success);
  return { error: null, success };
}
