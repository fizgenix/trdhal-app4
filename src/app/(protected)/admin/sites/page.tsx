import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { CardHeaderBand } from "@/components/ui/CardHeaderBand";
import { createSite } from "./actions";

export default async function AdminSitesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: sites }, { data: assignments }] = await Promise.all([
    supabase.from("sites").select("id, name, location").order("name"),
    supabase.from("user_sites").select("site_id"),
  ]);

  const userCountBySite = new Map<string, number>();
  for (const a of assignments ?? []) {
    userCountBySite.set(a.site_id, (userCountBySite.get(a.site_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-navy">Sites</h1>
        <p className="text-[#6b7280]">
          Add every construction site here before assigning users to it.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <form
          action={createSite}
          className="flex flex-col gap-4 rounded-2xl border border-brand-border bg-white p-5 shadow-sm"
        >
          <CardHeaderBand inset={5}>Add a site</CardHeaderBand>
          <Field label="Site name" name="name" placeholder="e.g. Sector 12 Tower" required />
          <Field label="Location (optional)" name="location" placeholder="e.g. Agra, UP" />
          <Button type="submit">Add site</Button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
          <div className="grid grid-cols-[1.4fr_1.4fr_0.6fr] gap-2 border-b border-brand-border bg-brand-cream px-[18px] py-3.5 text-[10.5px] font-bold uppercase tracking-wider text-[#8a836f]">
            <div>Site</div>
            <div>Location</div>
            <div>Users</div>
          </div>
          <div className="divide-y divide-brand-border-soft">
            {(sites ?? []).map((site) => (
              <div
                key={site.id}
                className="grid grid-cols-[1.4fr_1.4fr_0.6fr] items-center gap-2 px-[18px] py-3.5 text-sm"
              >
                <div className="font-bold text-brand-navy">{site.name}</div>
                <div className="text-[#4b5563]">{site.location ?? "—"}</div>
                <div className="text-[#4b5563]">{userCountBySite.get(site.id) ?? 0}</div>
              </div>
            ))}
            {(!sites || sites.length === 0) && (
              <p className="px-[18px] py-8 text-center text-[#7b8494]">
                No sites yet — add your first one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
