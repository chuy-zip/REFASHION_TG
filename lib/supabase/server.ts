import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * Uses the anon key, so every query runs as the signed-in user and RLS applies.
 * Never use the service_role key here — that would bypass the whole permission
 * model defined in migration 002.
 */
export async function createClient() {
  // Async in Next 16.
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Check .env.local"
    );
  }

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot set cookies. The middleware already
          // refreshes the session on every request, so ignoring this is safe.
        }
      },
    },
  });
}

/**
 * The authenticated user, or null.
 *
 * Uses getUser(), never getSession(): getSession() returns whatever the cookie
 * claims without revalidating it against the auth server, so it can be forged.
 *
 * Every Route Handler derives its user id from here. The middleware is a coarse
 * gate that turns away anonymous traffic; this is the authority.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) return null;
  return data.user;
}
