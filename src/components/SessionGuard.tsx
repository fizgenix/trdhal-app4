"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

/**
 * Sign-out rules for shared site laptops:
 *
 * - Closing the tab/window signs you out. sessionStorage is per tab and
 *   cleared when it closes, so a tab that loads without our marker is either
 *   a reopened app (sign out) or a second tab while another is still open
 *   (ask the open ones over BroadcastChannel, and stay signed in if one
 *   answers).
 * - 20 minutes with no clicks/typing/scrolling signs you out, with a warning
 *   2 minutes before. Last activity lives in localStorage so every open tab
 *   shares it, and it's a timestamp (not a countdown) so a laptop waking
 *   from sleep notices straight away.
 *
 * The proxy enforces the same limits server-side (touch_session) in case
 * the browser can't — this component is the friendly front half.
 */

export const IDLE_LIMIT_MS = 20 * 60_000;
const WARN_BEFORE_MS = 2 * 60_000;
const HEARTBEAT_EVERY_MS = 60_000;
const ACTIVITY_WRITE_EVERY_MS = 5_000;

export const TAB_MARKER_KEY = "trdhal:tab-alive";
export const LAST_ACTIVITY_KEY = "trdhal:last-activity";
const CHANNEL_NAME = "trdhal:session";

// Storage can throw (private windows, blocked site data) — fall back to
// memory so the timer still works in this tab.
let memoryLastActivity = Date.now();

export function recordActivity(at = Date.now()) {
  memoryLastActivity = at;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {}
}

function readLastActivity(): number {
  try {
    const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    if (stored) return Math.max(stored, memoryLastActivity);
  } catch {}
  return memoryLastActivity;
}

export function markTabAlive() {
  try {
    sessionStorage.setItem(TAB_MARKER_KEY, "1");
  } catch {}
}

function tabIsMarked(): boolean {
  try {
    return sessionStorage.getItem(TAB_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

function openChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SessionGuard() {
  const [checked, setChecked] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const signingOut = useRef(false);
  const lastHeartbeat = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const signOut = useCallback(async (reason: string, broadcast = true) => {
    if (signingOut.current) return;
    signingOut.current = true;
    if (broadcast) channelRef.current?.postMessage({ type: "signed-out", reason });
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {}
    window.location.replace(`/login?reason=${reason}`);
  }, []);

  const heartbeat = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastHeartbeat.current < HEARTBEAT_EVERY_MS) return;
      lastHeartbeat.current = now;
      try {
        const res = await fetch("/api/session", { cache: "no-store" });
        if (res.status === 401) {
          const body = (await res.json().catch(() => null)) as { signedOut?: string } | null;
          void signOut(body?.signedOut ?? "idle");
        }
      } catch {
        // Offline — the idle timer and the server check still apply.
      }
    },
    [signOut],
  );

  // Tab-close check + cross-tab messages.
  useEffect(() => {
    const channel = openChannel();
    channelRef.current = channel;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; reason?: string };
      if (data?.type === "ping" && tabIsMarked()) {
        channel?.postMessage({ type: "pong" });
      } else if (data?.type === "pong" && !tabIsMarked()) {
        // Another tab of the app is open — this is the same person.
        markTabAlive();
        if (!cancelled) setChecked(true);
      } else if (data?.type === "signed-out") {
        void signOut(data.reason ?? "idle", false);
      }
    };
    channel?.addEventListener("message", onMessage);

    if (tabIsMarked()) {
      // sessionStorage only exists in the browser, so this can't be the
      // initial state without a hydration mismatch; flip it right after.
      queueMicrotask(() => {
        if (!cancelled) setChecked(true);
      });
    } else {
      channel?.postMessage({ type: "ping" });
      timer = setTimeout(() => {
        if (!cancelled && !tabIsMarked()) void signOut("closed", false);
      }, 500);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      channelRef.current = null;
    };
  }, [signOut]);

  // Activity tracking + idle timer.
  useEffect(() => {
    if (!checked) return;

    let lastWrite = 0;
    const onActivity = () => {
      // While the warning is up, only the "Stay signed in" button counts.
      if (readLastActivity() + IDLE_LIMIT_MS - Date.now() <= WARN_BEFORE_MS) return;
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_EVERY_MS) return;
      lastWrite = now;
      recordActivity(now);
      void heartbeat();
    };

    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = () => {
      const left = readLastActivity() + IDLE_LIMIT_MS - Date.now();
      if (left <= 0) {
        void signOut("idle");
      } else {
        setRemainingMs(left <= WARN_BEFORE_MS ? left : null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    // A laptop waking up fires these before the next interval tick.
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [checked, heartbeat, signOut]);

  function staySignedIn() {
    recordActivity();
    setRemainingMs(null);
    void heartbeat(true);
  }

  if (!checked) {
    // Cover the page until we know this tab is allowed to show it.
    return <div className="fixed inset-0 z-[100] bg-brand-content" aria-hidden />;
  }

  if (remainingMs === null) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-white p-6 shadow-xl">
        <h2 id="idle-warning-title" className="text-lg font-extrabold text-brand-navy">
          Are you still there?
        </h2>
        <p className="mt-2 text-sm text-[#4b5563]">
          For security on shared laptops, you&apos;ll be signed out in{" "}
          <span className="font-bold tabular-nums text-brand-navy">
            {formatRemaining(remainingMs)}
          </span>{" "}
          because of inactivity.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => void signOut("manual")}>
            Sign out now
          </Button>
          <Button autoFocus onClick={staySignedIn}>
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  );
}
