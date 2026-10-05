"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Site = { id: string; name: string };

/**
 * Dropdown that switches the current page's ?site= query param. Shared
 * across the per-site screens (Orders, Receiving, Approvals, Release) so
 * users assigned to multiple sites can flip between them.
 *
 * Also remembers whichever site is showing in the selected_site cookie
 * (see lib/selected-site.ts), so switching to another tab opens the same
 * site rather than falling back to the user's first one. Done on render,
 * not just on change, so arriving via a ?site= link (e.g. from the
 * Dashboard) is remembered too.
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

  useEffect(() => {
    document.cookie = `selected_site=${selectedSiteId}; path=/; max-age=31536000; samesite=lax`;
  }, [selectedSiteId]);

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
