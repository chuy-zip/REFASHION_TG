import Link from "next/link";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/authz";
import { listEditableClients } from "@/lib/access";
import { LogoutButton } from "@/components/auth/LogoutButton/LogoutButton";
import { DesignWizard } from "@/components/designs/DesignWizard/DesignWizard";
import { TopBarNav } from "./TopBarNav";
import { POST_LOGIN_PATH } from "@/lib/routes";
import styles from "./AppTopBar.module.css";

/**
 * Global navigation shell. Rendered once in the (app) layout, so it persists
 * across navigations and stays pinned to the top edge.
 *
 * Replaced a 15rem left rail: two destinations never justified that much
 * permanent width, least of all on the screens built around showing a garment.
 *
 * Auth is enforced by proxy.ts; this only decides which links to show.
 */
export async function AppTopBar() {
  const [user, isAdmin] = await Promise.all([
    getAuthenticatedUser(),
    isCurrentUserAdmin(),
  ]);

  const supabase = await createSupabaseClient();
  const editableClients = user
    ? await listEditableClients(supabase, user.id, isAdmin)
    : [];

  return (
    <header className={styles.bar}>
      <Link href={POST_LOGIN_PATH} className={styles.brand}>
        Refashion IA
      </Link>

      <TopBarNav isAdmin={isAdmin} />

      {editableClients.length > 0 && (
        <>
          <div className={styles.divider} />
          {/* Left of the bar: getting around, and the one thing you can start
              from anywhere. Right of the bar: who you are. Sitting beside the
              account it read as part of it, which is not what it is.
              Secondary so it never competes with the screen's own action. */}
          <DesignWizard clients={editableClients} triggerVariant="secondary" />
        </>
      )}

      <div className={styles.spacer} />

      <div className={styles.account}>
        {user?.email && <span className={styles.email}>{user.email}</span>}
        <LogoutButton />
      </div>
    </header>
  );
}
