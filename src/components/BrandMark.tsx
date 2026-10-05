import Image from "next/image";

/**
 * The TR Dhal emblem (gold shield) used on the navbar and login screen.
 * Cropped from the company logo (TR-DHAL-logo-color.png) without the
 * "TR DHAL GROUP OF COMPANIES" line — that's dark brown and unreadable on
 * the navy chrome; the full lockup is public/logo-full.png for light
 * backgrounds.
 */
export function BrandMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt="TR Dhal"
      width={size}
      height={size}
      // Above the fold on every page.
      preload
      className={className}
    />
  );
}
