import { createClient } from "@/lib/supabase/server";

/**
 * Heartbeat for <SessionGuard>: pinged when the user is active in the
 * browser (typing into a form, say) without otherwise hitting the server.
 * The proxy records the activity — or answers 401 if the session has
 * already timed out — so all this needs to do is say whether there's
 * still a session.
 */
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return new Response(null, { status: data?.claims ? 204 : 401 });
}
