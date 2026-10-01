/**
 * The "TR" mark badge used beside the wordmark on the navbar and login
 * screen. An inline SVG rather than a raster image — crisp at any size,
 * no asset to ship, and matches the navy + gold language from the
 * "Final Screens v3" design (`assets/tr-dhal-mark.png` in that project).
 */
export function BrandMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="TR Dhal"
    >
      <rect width="40" height="40" rx="10" fill="#0f1a33" />
      <rect x="1" y="1" width="38" height="38" rx="9" stroke="#e9c96a" strokeWidth="1.5" />
      <text
        x="20"
        y="22.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="16"
        fontWeight="800"
        fill="#e9c96a"
      >
        TR
      </text>
    </svg>
  );
}
