/**
 * Flags a line that's had more delivered than was ordered (allowed since
 * 0013_allow_over_receiving.sql). Renders nothing when it hasn't.
 */
export function OverReceivedBadge({
  ordered,
  received,
  unit,
}: {
  ordered: number;
  received: number;
  unit: string;
}) {
  const extra = received - ordered;
  if (extra <= 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
      <span aria-hidden>▲</span>
      Over-received +{Number(extra.toFixed(2))} {unit}
    </span>
  );
}
