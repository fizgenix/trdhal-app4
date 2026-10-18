"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { BrandMark } from "@/components/BrandMark";

type NavItem = { href: string; label: string };

const isActiveHref = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const ACTIVE = "rounded-full bg-brand-gold-pale px-3.5 py-2 text-[13px] font-bold text-brand-navy";
const IDLE =
  "rounded-full px-3.5 py-2 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  return (
    <Link href={item.href} className={isActiveHref(pathname, item.href) ? ACTIVE : IDLE}>
      {item.label}
    </Link>
  );
}

/** "Admin ▾" — Sites, Users and Account tucked into one menu. */
function AdminMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = items.some((item) => isActiveHref(pathname, item.href));

  // Close after navigating, adjusted during render like the forms here.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 ${isActive ? ACTIVE : IDLE}`}
      >
        Admin <span aria-hidden className="text-[9px]">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 min-w-[170px] overflow-hidden rounded-xl border border-brand-border bg-white py-1.5 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={`block px-4 py-2 text-sm hover:bg-brand-content ${
                isActiveHref(pathname, item.href)
                  ? "font-bold text-brand-navy"
                  : "text-[#374151]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NavBar({
  fullName,
  roleLabel,
  showSiteNav,
  isAdmin,
}: {
  fullName: string;
  roleLabel: string | null;
  showSiteNav: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  const siteItems: NavItem[] = showSiteNav
    ? [
        { href: "/orders", label: "Orders" },
        { href: "/receiving", label: "Receiving" },
        { href: "/approvals", label: "Approvals" },
        { href: "/release", label: "Release" },
        { href: "/inventory", label: "Stock" },
      ]
    : [];

  const accountItem: NavItem = { href: "/account", label: "Account" };
  const adminItems: NavItem[] = [
    { href: "/admin/sites", label: "Sites" },
    { href: "/admin/users", label: "Users" },
    accountItem,
  ];

  return (
    <header className="border-b border-brand-gold-border bg-brand-navy text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <BrandMark size={34} />
          <div>
            <p className="text-[13px] font-bold leading-tight">TR Dhal Site Ops</p>
            <p className="text-[11px] leading-tight text-white/55">
              {fullName}
              {roleLabel ? ` · ${roleLabel}` : ""}
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          <NavLink item={{ href: "/dashboard", label: "Dashboard" }} pathname={pathname} />
          {siteItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          <span className="ml-3">
            {isAdmin ? (
              <AdminMenu items={adminItems} pathname={pathname} />
            ) : (
              <NavLink item={accountItem} pathname={pathname} />
            )}
          </span>
          <span className="ml-2">
            <SignOutButton />
          </span>
        </nav>
      </div>
    </header>
  );
}
