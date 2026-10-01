"use client";

import { KeyboardEvent, useId, useRef, useState } from "react";

type Option = { id: string; label: string };

/**
 * A type-to-filter combobox that still posts like a normal <select> —
 * the real value goes out via a hidden input named `name`, so server
 * actions written against `formData.get(name)` don't need to change.
 * Used for "Item" and "Shopkeeper" on the new-order form, where the
 * option list can get long enough that scrolling a native <select>
 * isn't the fastest way to find one.
 */
export function SearchableSelect({
  label,
  name,
  options,
  placeholder = "Type to search…",
  addNewLabel,
  required,
  onSelect,
}: {
  label: string;
  name: string;
  options: Option[];
  placeholder?: string;
  /** Always shown as the last row, e.g. "+ Add a new item…" */
  addNewLabel?: string;
  required?: boolean;
  /** Fires with the chosen option id, "__new__" for the add-new row, or "" once the text no longer matches a selection. */
  onSelect?: (id: string) => void;
}) {
  const fieldId = useId();
  const listId = `${fieldId}-list`;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const rows: Array<Option & { isAddNew?: boolean }> = [
    ...filtered,
    ...(addNewLabel ? [{ id: "__new__", label: addNewLabel, isAddNew: true }] : []),
  ];

  function choose(row: Option) {
    setSelectedId(row.id);
    setQuery(row.label);
    setOpen(false);
    onSelect?.(row.id);
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    // Typed text that was never picked from the list isn't a valid
    // selection — revert to whatever (if anything) is actually chosen.
    // The add-new row isn't part of `options` (it's synthesized into
    // `rows` below), so it needs its own check here — otherwise picking
    // "+ Add a new item…" and then tabbing into the new-item fields blew
    // this back to an empty, still-required box and silently blocked
    // submission.
    if (selectedId === "__new__" && addNewLabel) {
      setQuery(addNewLabel);
      return;
    }
    const selected = options.find((o) => o.id === selectedId);
    setQuery(selected ? selected.label : "");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && rows[highlight]) {
        e.preventDefault();
        choose(rows[highlight]);
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
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedId("");
          onSelect?.("");
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={handleKeyDown}
        className="rounded-[10px] border border-brand-input-border px-3.5 py-2.5 text-[15px] text-brand-navy placeholder:text-gray-400 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
      />
      <input type="hidden" name={name} value={selectedId} />

      {open && rows.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-[10px] border border-brand-border bg-white py-1 shadow-lg"
        >
          {rows.map((row, i) => (
            <li key={row.id} role="option" aria-selected={row.id === selectedId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                className={`block w-full px-3.5 py-2 text-left text-sm ${
                  i === highlight ? "bg-brand-cream" : "hover:bg-brand-cream"
                } ${row.isAddNew ? "font-bold text-brand-navy" : "text-brand-navy"}`}
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && rows.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-[10px] border border-brand-border bg-white px-3.5 py-2 text-sm text-[#7b8494] shadow-lg">
          No matches.
        </div>
      )}
    </div>
  );
}
