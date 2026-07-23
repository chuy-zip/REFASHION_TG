import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton/LogoutButton";
import { POST_LOGIN_PATH } from "@/lib/routes";
import styles from "./AppHeader.module.css";

/** Top bar for every signed-in page: brand, current user, sign out. */
export async function AppHeader() {
  const user = await getAuthenticatedUser();

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href={POST_LOGIN_PATH}>
        Refashion IA
      </Link>
      <div className={styles.session}>
        {user?.email && <span className={styles.email}>{user.email}</span>}
        <LogoutButton />
      </div>
    </header>
  );
}
