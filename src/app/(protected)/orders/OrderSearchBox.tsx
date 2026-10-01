"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Debounced text search over the order list — matches against item name
 * and shopkeeper name (server-side, in OrdersPage). Pushes `?q=` onto the
 * URL (alongside the current site/status) so the filter is shareable and
 * survives a refresh, the same pattern the status tabs already use.
 */
export function OrderSearchBox({
  basePath,
  siteId,
  status,
  defaultValue,
}: {
  basePath: string;
  siteId: string;
  status?: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync if the URL changes from elsewhere (e.g. the site
  // switcher, or the back button) — adjusted during render rather than in
  // an effect, the same pattern the form components in this app use. See
  // https://react.dev/learn/you-might-not-need-an-effect
  const [prevDefaultValue, setPrevDefaultValue] = useState(defaultValue);
  if (defaultValue !== prevDefaultValue) {
    setPrevDefaultValue(defaultValue);
    setValue(defaultValue);
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("site", siteId);
      if (status && status !== "all") params.set("status", status);
      if (next.trim()) params.set("q", next.trim());
      router.push(`${basePath}?${params.toString()}`);
    }, 300);
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8494]"
      >
        <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search item or shopkeeper…"
        aria-label="Search orders by item or shopkeeper"
        className="w-full rounded-[10px] border border-brand-input-border bg-white py-2.5 pl-9 pr-3.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      />
    </div>
  );
}
