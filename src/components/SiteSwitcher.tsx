"use client";

import { useRouter } from "next/navigation";

type Site = { id: string; name: string };

/**
 * Dropdown that switches the current page's ?site= query param. Shared
 * across any per-site screen (Orders, and later Receiving/Approval/
 * Release) so users assigned to multiple sites can flip between them.
 */
export function SiteSwitcher({
  sites,
  selectedSiteId,
  basePath,
}: {
  sites: Site[];
  selectedSiteId: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedSiteId}
      onChange={(e) => router.push(`${basePath}?site=${e.target.value}`)}
      aria-label="Switch site"
      className="rounded-[10px] border border-brand-input-border bg-white px-4 py-2.5 text-[15px] font-bold text-brand-navy focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
    >
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
