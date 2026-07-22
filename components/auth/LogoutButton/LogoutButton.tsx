"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LOGIN_PATH } from "@/lib/routes";
import styles from "./LogoutButton.module.css";

/**
 * Ends the session. Auth is cookie-based, so signOut() clears the sb-* cookies
 * in the browser; refresh() then re-runs the proxy, which now sees no user.
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
    <button
      type="button"
      className={styles.button}
      onClick={handleLogout}
      disabled={isLoading}
    >
      {isLoading ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}
