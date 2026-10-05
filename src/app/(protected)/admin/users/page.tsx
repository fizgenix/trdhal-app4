import { requireAdmin, SITE_ROLE_LABELS, type SiteRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Select } from "@/components/ui/Select";
import { SubmitButton, SubmitIconButton } from "@/components/ui/SubmitButton";
import { CreateUserForm } from "./CreateUserForm";
import { assignUserToSite, removeUserSiteAssignment } from "./actions";

type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
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
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: sites }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, is_admin, is_active")
        .order("full_name"),
      supabase.from("sites").select("id, name").order("name"),
      supabase.from("user_sites").select("id, user_id, site_id, role, sites ( name )"),
    ]);

  const assignmentsByUser = new Map<
    string,
    { id: string; siteName: string; role: SiteRole }[]
  >();
  for (const a of (assignments ?? []) as unknown as AssignmentRow[]) {
    const list = assignmentsByUser.get(a.user_id) ?? [];
    list.push({ id: a.id, siteName: siteName(a.sites), role: a.role });
    assignmentsByUser.set(a.user_id, list);
  }

  const typedProfiles = (profiles ?? []) as ProfileRow[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-navy">Users</h1>
        <p className="text-[#6b7280]">
          Create logins and assign each person to their site(s) and role.
        </p>
      </div>

      <CreateUserForm />

      <div className="flex flex-col gap-4">
        {typedProfiles.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-brand-navy">{p.full_name}</p>
                <p className="text-sm text-[#6b7280]">{p.email}</p>
              </div>
              {p.is_admin && (
                <span className="rounded-full bg-brand-navy px-3.5 py-1.5 text-xs font-bold text-brand-gold-text">
                  Admin — all sites
                </span>
              )}
              {!p.is_active && (
                <span className="rounded-full bg-[#d3cbb9] px-3.5 py-1.5 text-xs font-bold text-[#4b5563]">
                  Inactive
                </span>
              )}
            </div>

            {!p.is_admin && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(assignmentsByUser.get(p.id) ?? []).map((a) => (
                    <form
                      key={a.id}
                      action={removeUserSiteAssignment}
                      className="inline-flex items-center gap-2 rounded-full border border-[#ecd9a0] bg-[#fbf3dc] px-3 py-1 text-xs font-bold text-[#7a5608]"
                    >
                      <input type="hidden" name="assignment_id" value={a.id} />
                      <span>
                        {a.siteName} · {SITE_ROLE_LABELS[a.role] ?? a.role}
                      </span>
                      <SubmitIconButton
                        className="text-[#7a5608]/60 hover:text-red-600"
                        aria-label="Remove assignment"
                      >
                        ×
                      </SubmitIconButton>
                    </form>
                  ))}
                  {(assignmentsByUser.get(p.id) ?? []).length === 0 && (
                    <span className="text-xs text-[#7b8494]">No sites assigned yet.</span>
                  )}
                </div>

                <form
                  action={assignUserToSite}
                  className="mt-4 flex flex-wrap items-end gap-3 border-t border-brand-border-soft pt-4"
                >
                  <input type="hidden" name="user_id" value={p.id} />
                  <div className="w-48">
                    <Select label="Site" name="site_id" required defaultValue="">
                      <option value="" disabled>
                        Choose a site
                      </option>
                      {(sites ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-56">
                    <Select label="Role" name="role" required defaultValue="">
                      <option value="" disabled>
                        Choose a role
                      </option>
                      {Object.entries(SITE_ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <SubmitButton variant="secondary" pendingText="Assigning…">
                    Assign
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
        ))}
        {typedProfiles.length === 0 && (
          <p className="text-[#7b8494]">No users yet — create the first login above.</p>
        )}
      </div>
    </div>
  );
}
