"use client";

import { useEffect, useState } from "react";
import type { ToastMessage } from "@/lib/toast";

const DISPLAY_MS = 3000;

/**
 * Bottom-right pop-up notifications for major actions. The latest toast
 * arrives as a prop from the layout (see flashToast in lib/toast.ts); each
 * one is shown for ~3 seconds, and the cookie it came from is cleared
 * straight away so it doesn't reappear on the next navigation.
 */
export function Toaster({ toast }: { toast: ToastMessage | null }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [lastId, setLastId] = useState<string | null>(null);

  // Adjusting state during render on a changed prop, rather than in an
  // effect — https://react.dev/learn/you-might-not-need-an-effect
  if (toast && toast.id !== lastId) {
    setLastId(toast.id);
    setToasts((current) => [...current, toast]);
  }

  useEffect(() => {
    if (toast) document.cookie = "toast=; path=/; max-age=0";
  }, [toast]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((current) => current.slice(1)), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg sm:w-auto ${
            t.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-brand-gold-border bg-brand-navy text-white"
          }`}
        >
          <span aria-hidden className={t.type === "error" ? "text-red-600" : "text-brand-gold-light"}>
            {t.type === "error" ? "✕" : "✓"}
          </span>
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
