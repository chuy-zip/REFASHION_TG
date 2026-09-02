"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { LOGIN_PATH, LOGOUT_PATH } from "@/lib/routes";

/**
 * Ends the session.
 *
 * The work happens on the server (`app/api/auth/logout/route.ts`), and that is
 * the fix for a real production failure rather than a preference: calling
 * `supabase.auth.signOut()` from here sent a cross-origin request to
 * `supabase.co`, and on an expired token that came back without CORS headers,
 * so `fetch` rejected and this component sat on "Cerrando…" indefinitely. Same
 * origin removes the whole class of failure.
 *
 * **It leaves either way.** The `catch` does not report anything, because there
 * is nothing useful to say and nothing useful to do differently: the person
 * asked to sign out, so the app takes them to the login screen. `refresh()`
 * then re-runs the proxy against the now-missing cookies. If the request truly
 * did not land, the login screen is where they find that out, which is far
 * better than a button that never finishes.
 *
 * `ghost` on purpose: signing out is not something anyone came here to do, and
 * in the app bar a bordered button would carry the same weight as the one
 * action the bar actually offers.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);

    try {
      await fetch(LOGOUT_PATH, { method: "POST" });
    } catch {
      // Offline, or the request never landed. Leaving anyway — see above.
    }

    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={isLoading}>
      {isLoading ? "Cerrando…" : "Cerrar sesión"}
    </Button>
  );
}
