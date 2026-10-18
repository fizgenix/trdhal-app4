import { requireAdmin, SITE_ROLE_LABELS, type SiteRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsersTable, type UserRow } from "./UsersTable";

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  must_change_password: boolean;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  site_id: string;
  role: SiteRole;
  sites: { name: string } | { name: string }[] | null;
};

function siteName(sites: AssignmentRow["sites"]): string {
  if (!sites) return "Unknown site";
  if (Array.isArray(sites)) return sites[0]?.name ?? "Unknown site";
  return sites.name;
}

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: sites }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, is_admin, is_active, must_change_password",
        )
        .order("full_name"),
      supabase.from("sites").select("id, name").order("name"),
      supabase
        .from("user_sites")
        .select("id, user_id, site_id, role, sites ( name )"),
    ]);

  const assignmentsByUser = new Map<string, UserRow["assignments"]>();
  for (const a of (assignments ?? []) as unknown as AssignmentRow[]) {
    const list = assignmentsByUser.get(a.user_id) ?? [];
    list.push({
      id: a.id,
      siteName: siteName(a.sites),
      roleLabel: SITE_ROLE_LABELS[a.role] ?? a.role,
    });
    assignmentsByUser.set(a.user_id, list);
  }

  const users: UserRow[] = ((profiles ?? []) as ProfileRow[]).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    isAdmin: p.is_admin,
    isActive: p.is_active,
    mustChangePassword: p.must_change_password,
    assignments: assignmentsByUser.get(p.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <UsersTable
        users={users}
        sites={(sites ?? []) as { id: string; name: string }[]}
        roles={Object.entries(SITE_ROLE_LABELS).map(([value, label]) => ({ value, label }))}
        meId={me.id}
      />
    </div>
  );
}
