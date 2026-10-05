"use client";

import { KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { normalizeName, rankMatches, SIMILAR_THRESHOLD } from "@/lib/fuzzy";

/** `name` is what's matched against; `label` is what's shown (e.g. "Cement (bags)"). */
type Option = { id: string; label: string; name: string };
type Row = { id: string; label: string; isAddNew?: boolean };

export const NEW_ID = "__new__";

/**
 * Type-to-search picker that can also add a new entry, used for Item,
 * Vendor and a new item's Unit on the new-order form. Posts like a normal <select>: the chosen
 * id (or "__new__") goes out as `name`, and for a new entry the typed text
 * goes out as `newNameField`, so the server action reads plain form fields.
 *
 * - Search is fuzzy (lib/fuzzy.ts): case, spacing, punctuation and small
 *   typos are ignored, best matches first.
 * - Typing a name that isn't saved puts "+ Add “…” as a new item" at the
 *   top of the list, and leaving the field adds it automatically — unless
 *   it's close to an existing name, in which case the user is asked
 *   "Did you mean …?" and the form won't submit until they pick the
 *   existing one or confirm the new one. That's what stops typos turning
 *   into duplicate entries.
 */
export function SearchableSelect({
  label,
  name,
  newNameField,
  noun,
  options,
  placeholder = "Type to search…",
  required,
  savedWhen = "you place the order",
  initial,
  canonicalize = (s) => s,
  onSelect,
}: {
  label: string;
  name: string;
  /** Form field that carries the typed name when a new entry is chosen. */
  newNameField: string;
  /** "item" / "vendor" — used in the add-new and did-you-mean wording. */
  noun: string;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  /** Finishes "“X” will be saved when …" under a new entry. */
  savedWhen?: string;
  /** Option selected when the picker mounts (re-key the component to change it). */
  initial?: { id: string; label: string };
  /**
   * Maps known alternative spellings to a saved name before checking for an
   * exact match — e.g. units, where "kgs" should simply pick "kg".
   */
  canonicalize?: (s: string) => string;
  /**
   * Fires with the chosen option id ("__new__" for a new entry, "" once the
   * text no longer matches a selection) and the text now in the box.
   */
  onSelect?: (id: string, text: string) => void;
}) {
  const fieldId = useId();
  const listId = `${fieldId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initial?.label ?? "");
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [open, setOpen] = useState(false);
  // null = automatic: see `active` below.
  const [highlight, setHighlight] = useState<number | null>(null);

  const typed = query.trim();
  const exact = typed
    ? options.find(
        (o) => normalizeName(canonicalize(o.name)) === normalizeName(canonicalize(typed)),
      )
    : undefined;
  const ranked = typed
    ? rankMatches(typed, options, (o) => o.name)
    : options.map((option) => ({ option, score: 0 }));
  const similar = exact ? [] : ranked.filter((r) => r.score >= SIMILAR_THRESHOLD);

  const addNewRow: Row | null =
    typed && !exact ? { id: NEW_ID, label: `+ Add “${typed}” as a new ${noun}`, isAddNew: true } : null;
  const rows: Row[] = [...(addNewRow ? [addNewRow] : []), ...ranked.map((r) => r.option)];

  // Unless the user has arrowed/hovered somewhere, highlight the best
  // existing match when the text looks like a typo of one (so Enter picks
  // it), otherwise the add-new row at the top.
  const active = Math.min(highlight ?? (addNewRow && similar.length > 0 ? 1 : 0), rows.length - 1);

  // Typed text that hasn't been resolved to an existing or a confirmed-new
  // entry, and looks like a typo of something saved — block submission.
  const needsConfirm = !!typed && !selectedId && similar.length > 0;

  const closestName = similar[0]?.option.name;
  useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(
      needsConfirm
        ? `“${typed}” looks like “${closestName}”. Pick it, or confirm “${typed}” as a new ${noun}.`
        : "",
    );
  }, [needsConfirm, typed, closestName, noun]);

  function select(id: string, text: string) {
    setSelectedId(id);
    setQuery(text);
    setOpen(false);
    onSelect?.(id, text);
  }

  function choose(row: Row) {
    if (row.isAddNew) select(NEW_ID, typed);
    else select(row.id, row.label);
  }

  /** On leaving the field with unresolved text: use an exact match, auto-add if nothing's close, else leave it for the did-you-mean prompt. */
  function resolveTyped() {
    if (selectedId || !typed) return;
    if (exact) select(exact.id, exact.label);
    else if (similar.length === 0) select(NEW_ID, typed);
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    resolveTyped();
  }

  function openList() {
    setOpen(true);
    setHighlight(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openList();
      else setHighlight(Math.min(active + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      if (open && rows[active]) {
        e.preventDefault();
        choose(rows[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5" onBlur={handleBlur}>
      <label
        htmlFor={fieldId}
        className="text-[10.5px] font-bold uppercase tracking-wider text-[#6b6553]"
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        required={required}
        onFocus={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selectedId) {
            setSelectedId("");
            onSelect?.("", "");
          }
          setOpen(true);
          setHighlight(null);
        }}
        onKeyDown={handleKeyDown}
        className="rounded-[10px] border border-brand-input-border px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      />
      <input type="hidden" name={name} value={selectedId} />
      <input type="hidden" name={newNameField} value={selectedId === NEW_ID ? typed : ""} />

      {selectedId === NEW_ID && (
        <p className="text-xs text-[#7b8494]">
          <span className="mr-1.5 rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-800">
            New {noun}
          </span>
          “{typed}” will be saved when {savedWhen}.
        </p>
      )}

      {needsConfirm && !open && (
        <div className="rounded-[10px] border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <p className="font-semibold">
            “{typed}” isn&apos;t saved yet. Did you mean:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {similar.slice(0, 3).map(({ option }) => (
              <button
                key={option.id}
                type="button"
                onClick={() => select(option.id, option.label)}
                className="rounded-full border border-amber-400 bg-white px-3 py-1 text-xs font-bold text-brand-navy hover:bg-amber-100"
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => select(NEW_ID, typed)}
              className="rounded-full px-3 py-1 text-xs font-semibold text-amber-900 underline hover:bg-amber-100"
            >
              No, add “{typed}” as a new {noun}
            </button>
          </div>
        </div>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-[10px] border border-brand-border bg-white py-1 shadow-lg"
        >
          {!typed && (
            <li className="px-3.5 py-2 text-xs text-[#7b8494]">
              Type to search — or type a new name to add it.
            </li>
          )}
          {rows.map((row, i) => (
            <li key={row.id} role="option" aria-selected={row.id === selectedId}>
              <button
                type="button"
                // Rows are picked by mouse or arrow keys; Tab should leave the field.
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(row)}
                className={`block w-full px-3.5 py-2 text-left text-sm text-brand-navy ${
                  i === active ? "bg-brand-cream" : ""
                } ${row.isAddNew ? "border-b border-brand-border-soft font-bold" : ""}`}
              >
                {row.label}
                {row.isAddNew && similar.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    — similar {noun}s exist below
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
