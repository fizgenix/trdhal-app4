import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SiteRole = "ho1_ordering" | "ho2_receiving" | "ho3_accounts";

export const SITE_ROLE_LABELS: Record<SiteRole, string> = {
  ho1_ordering: "Ordering (HO1)",
  ho2_receiving: "Receiving / Vendor (HO2)",
  ho3_accounts: "Accounts / Approval (HO3)",
};

export type SiteAssignment = {
  site_id: string;
  site_name: string;
  role: SiteRole;
};

export type CurrentUser = {
  id: string;
  fullName: string;
  email: string | null;
  isAdmin: boolean;
  siteAssignments: SiteAssignment[];
};

type UserSiteRow = {
  site_id: string;
  role: SiteRole;
  sites: { name: string } | { name: string }[] | null;
};

function siteName(sites: UserSiteRow["sites"]): string {
  if (!sites) return "Unknown site";
  if (Array.isArray(sites)) return sites[0]?.name ?? "Unknown site";
  return sites.name;
}

/**
 * Returns the signed-in user's profile plus every (site, role) they're
 * assigned to, or null if there's no session / the profile is inactive.
 * Safe to call from any Server Component or Server Action.
 *
 * Wrapped in React cache() so the layout and the page share one lookup per
 * request instead of each repeating it. getClaims() verifies the session
 * JWT (locally, when the project uses asymmetric signing keys) rather than
 * always round-tripping to the Auth server, and the profile and site
 * lookups run in parallel.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (!userId) return null;

  const [{ data: profile }, { data: assignments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, is_admin, is_active")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_sites")
      .select("site_id, role, sites ( name )")
      .eq("user_id", userId),
  ]);

  if (!profile || !profile.is_active) return null;

  const siteAssignments: SiteAssignment[] = (
    (assignments ?? []) as unknown as UserSiteRow[]
  ).map((a) => ({
    site_id: a.site_id,
    role: a.role,
    site_name: siteName(a.sites),
  }));

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    isAdmin: profile.is_admin,
    siteAssignments,
  };
});

/** Redirects to /login if there's no signed-in, active user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Redirects non-admins to /dashboard. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard");
  return user;
}
