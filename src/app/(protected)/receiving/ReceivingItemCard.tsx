"use client";

import { ReactNode, useState } from "react";

/** `percent` can pass 100 on an over-received line — the ring turns red and shows it. */
function ProgressRing({ percent, isOver, isDone }: { percent: number; isOver: boolean; isDone: boolean }) {
  const color =
    isOver
      ? "#dc2626"
      : isDone
        ? "var(--color-status-completed)"
        : percent > 0
          ? "var(--color-status-pending)"
          : "#e5e7eb";
  const sweep = Math.min(percent, 100) * 3.6;
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-brand-navy"
      style={{ background: `conic-gradient(${color} ${sweep}deg, #efebe2 ${sweep}deg 360deg)` }}
    >
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white">
        {percent}%
      </span>
    </div>
  );
}

type Tab = { key: string; label: string; content: ReactNode };

/**
 * One open item of a PO on the Receiving page. The row shows its progress;
 * ▼ opens it to the Receive / History / Edits tabs passed in `tabs`. The
 * card stays open across a save, so logging a delivery doesn't throw the
 * user out of it.
 */
export function ReceivingItemCard({
  name,
  unit,
  description,
  percent,
  received,
  ordered,
  remainingLabel,
  isOver,
  deliveryCount,
  editCount,
  dimmed,
  tabs,
  defaultExpanded = false,
}: {
  name: string;
  unit: string;
  description: string | null;
  percent: number;
  received: string;
  ordered: string;
  /** "3.99 pcs left", "✓ Fully received" or "▲ 5 pcs over". */
  remainingLabel: string;
  isOver: boolean;
  deliveryCount: number;
  editCount: number;
  /** Fully received — shown greyed out, still openable for its history. */
  dimmed: boolean;
  tabs: Tab[];
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  const barColor = isOver
    ? "bg-red-500"
    : dimmed
      ? "bg-status-completed"
      : "bg-status-pending";

  // Left accent strip — keeps neighbouring items in a long PO visibly apart.
  const accentColor = isOver
    ? "border-l-red-500"
    : dimmed
      ? "border-l-status-completed"
      : percent > 0
        ? "border-l-status-pending"
        : "border-l-brand-border";

  return (
    <div
      className={`overflow-hidden rounded-xl border border-l-4 bg-white shadow-[0_1px_3px_rgba(15,26,51,0.08)] ${accentColor} ${
        expanded ? "border-brand-navy shadow-[0_4px_12px_-4px_rgba(15,26,51,0.25)]" : "border-brand-border"
      }`}
    >
      {/* Phones: ring | name | ▼ with the numbers stacked under the name.
          Desktop: one row — ring, name, received, chips, bar, ▼. */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className={`grid w-full grid-cols-[36px_minmax(0,1fr)_16px] items-center gap-x-4 gap-y-2 px-3 py-2.5 text-left hover:bg-brand-cream/50 md:grid-cols-[36px_minmax(0,1fr)_150px_110px_120px_16px] ${
          dimmed && !expanded ? "opacity-70" : ""
        }`}
      >
        <ProgressRing percent={percent} isOver={isOver} isDone={dimmed} />
        <div className="min-w-0">
          <p className="break-words text-sm font-bold text-brand-navy">
            {name} <span className="font-normal text-[#7b8494]">({unit})</span>
          </p>
          {description && <p className="break-words text-xs text-[#7b8494]">{description}</p>}
        </div>
        <div className="col-start-2 md:col-start-auto">
          <p className={`text-sm font-bold ${isOver ? "text-red-700" : "text-brand-navy"}`}>
            {received} / {ordered}
          </p>
          <p className={`text-[11px] ${isOver ? "font-bold text-red-700" : "text-[#7b8494]"}`}>
            {remainingLabel}
          </p>
        </div>
        <div className="col-start-2 flex flex-wrap gap-1 md:col-start-auto">
          {deliveryCount > 0 && (
            <span className="rounded-full border border-brand-border-soft px-2 py-0.5 text-[10.5px] font-bold text-[#4b5563]">
              {deliveryCount} deliver{deliveryCount === 1 ? "y" : "ies"}
            </span>
          )}
          {editCount > 0 && (
            <span
              title={`${editCount} edit${editCount === 1 ? "" : "s"}`}
              className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800"
            >
              ✎ {editCount}
            </span>
          )}
        </div>
        <div className="col-start-2 h-1.5 overflow-hidden rounded-full bg-[#efebe2] md:col-start-auto">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <span className="col-start-3 row-start-1 text-[10px] text-brand-navy md:col-start-auto md:row-start-auto">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-brand-border-soft">
          <div className="flex gap-1 border-b border-brand-border-soft bg-brand-cream px-3">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveKey(tab.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-bold ${
                  tab.key === active?.key
                    ? "border-brand-gold text-brand-navy"
                    : "border-transparent text-[#7b8494] hover:text-brand-navy"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-3">{active?.content}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A History row with a ✎ Edit button that opens `editForm` under it.
 * `version` changes when the delivery does, closing the form after a save.
 */
export function EditableRow({
  summary,
  editForm,
  version,
}: {
  summary: ReactNode;
  editForm?: ReactNode;
  version: string;
}) {
  const [open, setOpen] = useState(false);
  const [prevVersion, setPrevVersion] = useState(version);
  if (version !== prevVersion) {
    setPrevVersion(version);
    setOpen(false);
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{summary}</div>
        {editForm && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold text-brand-navy hover:bg-brand-content ${
              open ? "border-brand-navy bg-brand-content" : "border-brand-border bg-white"
            }`}
          >
            {open ? "Close" : "✎ Edit"}
          </button>
        )}
      </div>
      {open && editForm}
    </li>
  );
}
