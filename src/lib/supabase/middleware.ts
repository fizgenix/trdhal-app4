import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request so server
 * components always see an up-to-date user. Must run in src/middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touching the session is what actually refreshes an expired one.
  // getClaims() does that too, but verifies the JWT locally (with
  // asymmetric signing keys) instead of calling the Auth server on every
  // request the way getUser() does.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return supabaseResponse;

  // Server-side session timeouts (see 0019_session_timeouts.sql). Checked at
  // most once a minute per browser, tracked by a cookie, to keep the extra
  // database round trip off most requests.
  const now = Date.now();
  const lastCheck = Number(request.cookies.get(ACTIVITY_COOKIE)?.value ?? 0);
  if (lastCheck <= now && now - lastCheck < ACTIVITY_CHECK_MS) {
    return supabaseResponse;
  }

  const { data: status, error } = await supabase.rpc("touch_session");

  // On an error (e.g. migration not applied yet) fail open, as before.
  if (error || status === "ok") {
    supabaseResponse.cookies.set(ACTIVITY_COOKIE, String(now), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return supabaseResponse;
  }

  return endSession(request, supabaseResponse, String(status));
}

const ACTIVITY_COOKIE = "last_activity_check";
const ACTIVITY_CHECK_MS = 60_000;

/**
 * The database has already deleted the session; clear the auth cookies too
 * (the access token would otherwise stay valid until it expires) and send
 * the user to /login with the reason.
 */
function endSession(request: NextRequest, sessionResponse: NextResponse, reason: string) {
  const { pathname } = request.nextUrl;

  let response: NextResponse;
  if (pathname.startsWith("/api/")) {
    response = NextResponse.json({ signedOut: reason }, { status: 401 });
  } else if (pathname.startsWith("/login")) {
    response = sessionResponse;
  } else {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?reason=${encodeURIComponent(reason)}`;
    response = NextResponse.redirect(url);
  }

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") || cookie.name === ACTIVITY_COOKIE) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
    }
  }
  return response;
}
