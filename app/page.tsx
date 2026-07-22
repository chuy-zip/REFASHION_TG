import { getAuthenticatedUser } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/LogoutButton/LogoutButton";
import styles from "./page.module.css";

/**
 * Post-login landing. Placeholder for Step 1: proves the session round-trip
 * (sign in -> land here -> sign out). In Step 2 this redirects to /clients.
 *
 * The proxy guarantees a session before this renders; getAuthenticatedUser is
 * the authoritative read of who that user is.
 */
export default async function HomePage() {
  const user = await getAuthenticatedUser();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>Refashion IA</span>
        <div className={styles.session}>
          {user?.email && <span className={styles.email}>{user.email}</span>}
          <LogoutButton />
        </div>
      </header>

      <section className={styles.body}>
        <p className={styles.placeholder}>
          Sesión iniciada. El panel de clientes llega en el siguiente paso.
        </p>
      </section>
    </main>
  );
}
