import Link from "next/link";

export const PAGE_SIZE = 50;

/**
 * One page of `rows` from the `?page=` param (1-based; out-of-range values
 * clamp to the first / last page).
 */
export function paginate<T>(rows: T[], pageParam: string | undefined, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(pageParam ?? "", 10) || 1));
  const start = (page - 1) * pageSize;
  return {
    pageRows: rows.slice(start, start + pageSize),
    page,
    pageCount,
    start,
    total: rows.length,
  };
}

/** Clamps the `?page=` param for a list paged in the database. */
export function pageFromParam(pageParam: string | undefined) {
  return Math.max(1, Number.parseInt(pageParam ?? "", 10) || 1);
}

const linkClass =
  "rounded-full border border-brand-border px-4 py-1.5 font-bold text-brand-navy hover:bg-brand-cream";
const disabledClass = "rounded-full border border-brand-border-soft px-4 py-1.5 font-bold text-gray-300";

/**
 * "Showing 51–100 of 230 · ← Previous · Page 2 of 5 · Next →" under a list.
 * `href` is the list's current URL (filters, search, tab) without `page`;
 * renders nothing when everything fits on one page.
 */
export function Pagination({
  href,
  page,
  total,
  pageSize = PAGE_SIZE,
  className = "",
}: {
  href: string;
  page: number;
  total: number;
  pageSize?: number;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize;
  const pageHref = (p: number) =>
    p > 1 ? `${href}${href.includes("?") ? "&" : "?"}page=${p}` : href;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-[#6b7280] ${className}`}
    >
      <p>
        Showing {Math.min(total, start + 1)}–{Math.min(total, start + pageSize)} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className={linkClass}>
            ← Previous
          </Link>
        ) : (
          <span className={disabledClass}>← Previous</span>
        )}
        <span className="px-1 font-bold text-brand-navy">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={pageHref(page + 1)} className={linkClass}>
            Next →
          </Link>
        ) : (
          <span className={disabledClass}>Next →</span>
        )}
      </div>
    </div>
  );
}
