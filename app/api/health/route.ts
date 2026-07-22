import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";

/**
 * Smoke test for the auth gate.
 *
 * Without a session the middleware answers 401 before this ever runs. The check
 * below is the handler-level guard that every real endpoint repeats — it is
 * what produces the trusted user id, and it keeps the endpoint safe even if the
 * middleware matcher is ever changed.
 */
export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json({ status: "ok", user_id: user.id });
}
