import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser components.
 *
 * Only NEXT_PUBLIC_* vars are readable here, which is the point: the service
 * role key and the R2 credentials must never reach the bundle. Anything that
 * needs them goes through /api/*.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Check .env.local"
    );
  }

  return createBrowserClient(url, publishableKey);
}
