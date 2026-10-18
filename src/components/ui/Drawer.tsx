"use client";

import { ReactNode, useEffect } from "react";

/**
 * A panel that slides over the right edge of the page, with a dimmed
 * backdrop — clicking it, ✕ or Esc calls onClose. `children` fill the
 * panel below the header; put a form's submit button in a
 * `mt-auto` footer to pin it to the bottom.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    // Keep the page behind from scrolling while the panel is open.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-border-soft bg-brand-cream px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-brand-navy">{title}</h2>
            {subtitle && <p className="text-xs text-[#7b8494]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-white text-brand-navy hover:bg-brand-content"
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
