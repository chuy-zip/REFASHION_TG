import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client built with the SECRET key.
 *
 * It bypasses RLS completely and can reach the Auth Admin API. Use it only
 * inside routes already gated by requireAdmin(), and only for work the ordinary
 * client genuinely cannot do:
 *   - creating and deleting auth users
 *   - changing profiles.role_id (the escalation trigger only allows the
 *     service role)
 *
 * Never import this from a client component.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "The Supabase admin client must never be created in the browser."
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Check .env.local"
    );
  }

  // No session to persist or refresh: this is a server-to-server connection.
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
