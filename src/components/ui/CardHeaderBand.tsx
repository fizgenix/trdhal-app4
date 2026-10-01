/**
 * The uppercase label strip across the top of a card/form — "Place a new
 * order", "Current stock", "Add a site", etc. in the design. Meant to sit
 * as the first child inside a `p-6` (or `p-5`) card/form; the negative
 * margins pull it flush to the card's edges the same way the design's
 * `margin:-18px -18px 18px` trick does, so pass `inset` to match your
 * container's own padding (defaults to the `p-6` used by most forms here).
 */
export function CardHeaderBand({
  children,
  inset = 6,
  className = "",
}: {
  children: React.ReactNode;
  inset?: 5 | 6;
  className?: string;
}) {
  const insetClass = inset === 5 ? "-mx-5 -mt-5" : "-mx-6 -mt-6";
  return (
    <div
      className={`${insetClass} rounded-t-2xl border-b border-brand-border-soft bg-brand-cream px-5 py-3.5 text-[11px] font-bold uppercase tracking-widest text-brand-navy ${className}`}
    >
      {children}
    </div>
  );
}
