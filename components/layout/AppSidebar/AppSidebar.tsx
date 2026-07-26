import Link from "next/link";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/authz";
import { listEditableClients } from "@/lib/access";
import { LogoutButton } from "@/components/auth/LogoutButton/LogoutButton";
import { NewDesignWizard } from "@/components/designs/NewDesignWizard/NewDesignWizard";
import { SidebarNav } from "./SidebarNav";
import { POST_LOGIN_PATH } from "@/lib/routes";
import styles from "./AppSidebar.module.css";

/**
 * Global navigation shell. Rendered once in the (app) layout, so it persists
 * across navigations and stays flush to the left edge, full height.
 *
 * Auth is enforced by proxy.ts; this only decides which links to show.
 */
export async function AppSidebar() {
  const [user, isAdmin] = await Promise.all([
    getAuthenticatedUser(),
    isCurrentUserAdmin(),
  ]);

  const supabase = await createSupabaseClient();
  const editableClients = user
    ? await listEditableClients(supabase, user.id, isAdmin)
    : [];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.top}>
        <Link href={POST_LOGIN_PATH} className={styles.brand}>
          Refashion IA
        </Link>
        {editableClients.length > 0 && (
          <NewDesignWizard clients={editableClients} />
        )}
        <SidebarNav isAdmin={isAdmin} />
      </div>

      <div className={styles.bottom}>
        {user?.email && <span className={styles.email}>{user.email}</span>}
        <LogoutButton />
      </div>
    </aside>
  );
}
