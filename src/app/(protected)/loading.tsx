/**
 * Shown the moment you switch tabs (Orders / Receiving / Approvals /
 * Release / Dashboard) while the page's data loads. Every one of those
 * pages is rendered per request, so without this the click would appear
 * to do nothing until the server answered — Next.js prefetches this
 * skeleton ahead of time so navigation is instant.
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-48 rounded-lg bg-[#e7e1d3]" />
        <div className="h-4 w-80 max-w-full rounded bg-[#efebe2]" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="h-5 w-24 rounded-full bg-[#efebe2]" />
            <div className="h-5 w-40 rounded bg-[#efebe2]" />
          </div>
          <div className="h-3 w-2/3 rounded bg-[#f3f0e8]" />
          <div className="h-3 w-1/2 rounded bg-[#f3f0e8]" />
        </div>
      ))}
    </div>
  );
}
