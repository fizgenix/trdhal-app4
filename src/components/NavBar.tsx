"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { BrandMark } from "@/components/BrandMark";

type NavItem = { href: string; label: string };

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      className={
        isActive
          ? "rounded-full bg-brand-gold-pale px-3.5 py-2 text-[13px] font-bold text-brand-navy"
          : "rounded-full px-3.5 py-2 text-[13px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
      }
    >
      {item.label}
    </Link>
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
      ]
    : [];

  const adminItems: NavItem[] = isAdmin
    ? [
        { href: "/admin/sites", label: "Sites" },
        { href: "/admin/users", label: "Users" },
      ]
    : [];

  return (
    <header className="border-b border-brand-gold-border bg-brand-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5">
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
          {adminItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          <span className="ml-2">
            <SignOutButton />
          </span>
        </nav>
      </div>
    </header>
  );
}
