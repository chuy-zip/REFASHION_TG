"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_PATH } from "@/lib/routes";

/**
 * Ends the session. Auth is cookie-based, so signOut() clears the sb-* cookies
 * in the browser; refresh() then re-runs the proxy, which now sees no user.
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
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace(LOGIN_PATH);
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={isLoading}>
      {isLoading ? "Cerrando…" : "Cerrar sesión"}
    </Button>
  );
}
