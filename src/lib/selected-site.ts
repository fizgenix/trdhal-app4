import "server-only";
import { cookies } from "next/headers";

/** Cookie holding the site the user last opened — written by <SiteSwitcher>. */
export const SELECTED_SITE_COOKIE = "selected_site";

/**
 * Picks the site a per-site page should show: the explicit ?site= param if
 * it's one of the user's sites, otherwise the site they last had open (so
 * moving between Orders / Receiving / Approvals / Release keeps the same
 * site), otherwise their first site.
 */
export async function resolveSelectedSiteId(
  sites: { id: string }[],
  siteParam: string | undefined,
): Promise<string> {
  const isUsable = (id: string | undefined): id is string =>
    !!id && sites.some((s) => s.id === id);

  if (isUsable(siteParam)) return siteParam;

  const remembered = (await cookies()).get(SELECTED_SITE_COOKIE)?.value;
  if (isUsable(remembered)) return remembered;

  return sites[0].id;
}
