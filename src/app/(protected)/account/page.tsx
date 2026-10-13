import { requireUser } from "@/lib/auth";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-navy">Account</h1>
        <p className="text-[#6b7280]">
          Signed in as {user.fullName}
          {user.email ? ` (${user.email})` : ""}.
        </p>
      </div>

      <div className="max-w-md rounded-2xl border border-brand-border bg-white p-6 shadow-sm">
        <div className="mb-5">
          <CardHeaderBand>Change password</CardHeaderBand>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
