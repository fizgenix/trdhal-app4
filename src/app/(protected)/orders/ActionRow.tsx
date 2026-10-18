"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

export type RowAction = {
  key: string;
  label: string;
  tone?: "danger";
  /** Opens under the row when the action is picked from the ⋯ menu. */
  panel: ReactNode;
};

/**
 * A row of the Orders table: optional ▾ toggle on the left that shows
 * `children` (a PO's item lines), the row's own cells in `summary`, and a
 * ⋯ menu on the right whose actions open their form under the row.
 *
 * `version` should change whenever the row's data does — an open action
 * panel closes then, so a saved edit doesn't leave its form hanging open.
 */
export function ActionRow({
  summary,
  actions = [],
  children,
  defaultExpanded = false,
  version,
  className = "",
  rowClassName = "",
}: {
  summary: ReactNode;
  actions?: RowAction[];
  children?: ReactNode;
  defaultExpanded?: boolean;
  version?: string;
  className?: string;
  /** Padding etc. for the row itself — `children` and panels sit outside it. */
  rowClassName?: string;
}) {
  const expandable = children !== undefined;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjusted during render, the same pattern the form components here use.
  const [prevVersion, setPrevVersion] = useState(version);
  if (version !== prevVersion) {
    setPrevVersion(version);
    setActiveKey(null);
  }
  const [prevDefaultExpanded, setPrevDefaultExpanded] = useState(defaultExpanded);
  if (defaultExpanded !== prevDefaultExpanded) {
    setPrevDefaultExpanded(defaultExpanded);
    setExpanded(defaultExpanded);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const active = actions.find((a) => a.key === activeKey);

  return (
    <div className={className} data-expanded={expandable && expanded}>
      <div className={`flex items-center gap-2 ${rowClassName}`}>
        {expandable ? (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide items" : "Show items"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-border bg-white text-[10px] text-brand-navy hover:bg-brand-content"
          >
            {expanded ? "▲" : "▼"}
          </button>
        ) : null}

        <div className="min-w-0 flex-1">{summary}</div>

        <div ref={menuRef} className="relative w-8 shrink-0">
          {actions.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Actions"
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-base leading-none text-brand-navy hover:bg-brand-content ${
                  menuOpen || active ? "border-brand-navy bg-brand-content" : "border-brand-border bg-white"
                }`}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-brand-border bg-white py-1 shadow-lg"
                >
                  {actions.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveKey((k) => (k === action.key ? null : action.key));
                        setMenuOpen(false);
                      }}
                      className={`block w-full px-4 py-2 text-left text-sm hover:bg-brand-content ${
                        action.tone === "danger" ? "text-red-700" : "text-brand-navy"
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {active && (
        <div className="mx-4 mb-3 rounded-xl border border-brand-border-soft bg-brand-cream p-4">
          <div className="flex items-center justify-between gap-3">
            <p
              className={`text-xs font-bold uppercase tracking-wider ${
                active.tone === "danger" ? "text-red-700" : "text-brand-navy"
              }`}
            >
              {active.label}
            </p>
            <button
              type="button"
              onClick={() => setActiveKey(null)}
              className="text-xs font-semibold text-[#7b8494] hover:text-brand-navy"
            >
              Close
            </button>
          </div>
          {active.panel}
        </div>
      )}

      {expandable && expanded && children}
    </div>
  );
}
