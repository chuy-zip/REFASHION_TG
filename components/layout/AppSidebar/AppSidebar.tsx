import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/authz";
import { LogoutButton } from "@/components/auth/LogoutButton/LogoutButton";
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

  return (
    <aside className={styles.sidebar}>
      <div className={styles.top}>
        <Link href={POST_LOGIN_PATH} className={styles.brand}>
          Refashion IA
        </Link>
        <SidebarNav isAdmin={isAdmin} />
      </div>

      <div className={styles.bottom}>
        {user?.email && <span className={styles.email}>{user.email}</span>}
        <LogoutButton />
      </div>
    </aside>
  );
}
