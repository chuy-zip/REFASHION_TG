import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/logout — ends the session, from the server.
 *
 * **Why this route exists at all.** Signing out used to be
 * `supabase.auth.signOut()` called in the browser, which was the only write in
 * the whole app that left the browser without passing through the server. In
 * production it broke: the request goes from `refashion-tg.vercel.app` to
 * `supabase.co`, so it is cross-origin, and when the access token has expired
 * the auth endpoint rejects it before its CORS middleware runs. The response
 * comes back with no `Access-Control-Allow-Origin`, so the browser reports a
 * CORS failure instead of the 401 it really is, `fetch` rejects, and the button
 * sat on "Cerrando…" forever. Same origin, no CORS, no such failure mode.
 *
 * **It never fails.** Whatever the auth server says, the `sb-*` cookies are
 * gone by the time this returns, because those cookies are what this app
 * treats as the session (`proxy.ts` reads them on every request). Refusing to
 * sign someone out because a remote call failed would be the wrong trade in
 * both directions: it leaves them signed in, and it leaves them stuck.
 *
 * Revocation is still attempted first, so the refresh token really does die
 * server-side whenever the token is healthy enough to ask.
 */
export async function POST() {
  const supabase = await createClient();

  try {
    // Default scope, which revokes the refresh token everywhere. It is the
    // right thing when it works and the thing that cannot work on an expired
    // token — hence the catch rather than a weaker scope.
    await supabase.auth.signOut();
  } catch {
    // Deliberately silent: there is nothing the user could do with this, and
    // the cookies below are cleared either way. This is not swallowing a
    // failure — the operation still completes, by the line after it.
  }

  // Belt and braces. A successful signOut() has already cleared these through
  // the cookie adapter; this covers the path where it threw before getting
  // there, which is exactly the path that caused the bug.
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) cookieStore.delete(cookie.name);
  }

  return NextResponse.json({ ok: true });
}
