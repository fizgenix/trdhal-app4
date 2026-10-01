import { ReactNode } from "react";
import { requireUser, SITE_ROLE_LABELS } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const roleLabel = user.isAdmin
    ? "Admin"
    : (SITE_ROLE_LABELS[user.siteAssignments[0]?.role] ?? null);

  return (
    <div className="min-h-screen bg-brand-content">
      <NavBar
        fullName={user.fullName}
        roleLabel={roleLabel}
        showSiteNav={user.isAdmin || user.siteAssignments.length > 0}
        isAdmin={user.isAdmin}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
