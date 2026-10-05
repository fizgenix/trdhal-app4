import "server-only";
import { cookies } from "next/headers";

export type ToastType = "success" | "error";
export type ToastMessage = { id: string; message: string; type: ToastType };

export const TOAST_COOKIE = "toast";

/**
 * Queues a pop-up notification from a Server Action. Setting a cookie in a
 * Server Action makes Next re-render the current layout, which reads it back
 * (readToast) and hands it to <Toaster>, which shows it and clears the cookie.
 * Works the same whether the action returns state, returns nothing, or
 * redirects.
 */
export async function flashToast(message: string, type: ToastType = "success") {
  const toast: ToastMessage = { id: crypto.randomUUID(), message, type };
  (await cookies()).set(TOAST_COOKIE, JSON.stringify(toast), {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    // Read and cleared client-side by <Toaster>, so not httpOnly.
    httpOnly: false,
  });
}

export async function readToast(): Promise<ToastMessage | null> {
  const raw = (await cookies()).get(TOAST_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ToastMessage;
  } catch {
    return null;
  }
}
