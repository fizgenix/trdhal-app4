import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { SignOutButton } from "@/components/SignOutButton";
import { Toaster } from "@/components/Toaster";
import { SessionGuard } from "@/components/SessionGuard";
import { readToast } from "@/lib/toast";
import { ChangePasswordForm } from "../(protected)/account/ChangePasswordForm";

/**
 * First-login (or post-reset) step. Lives outside the (protected) group
 * because that layout's requireUser() redirects here — it would loop.
 */
export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-content px-4 py-12">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-brand-border bg-white shadow-xl sm:grid-cols-2">
        <div className="flex flex-col justify-center gap-4 border-b border-brand-gold-border bg-brand-navy px-10 py-14 text-white sm:border-b-0 sm:border-r">
          <BrandMark size={56} />
          <h1 className="text-2xl font-extrabold leading-tight">
            Welcome,
            <br />
            <span className="text-brand-gold-pale">{user.fullName}</span>
          </h1>
          <p className="max-w-xs text-sm text-white/65">
            You signed in with a temporary password from your Admin. Choose your
            own password to continue — only you will know it.
          </p>
          <div>
            <SignOutButton />
          </div>
        </div>

        <div className="flex flex-col justify-center gap-5 px-8 py-12 sm:px-10">
          <h2 className="text-xl font-extrabold text-brand-navy">Set your password</h2>
          <ChangePasswordForm firstLogin />
        </div>
      </div>

      <Toaster toast={await readToast()} />
      <SessionGuard />
    </div>
  );
}
