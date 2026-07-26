import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./loading.module.css";

/**
 * Shown instantly on navigation within the app shell while the destination
 * Server Component fetches its data. Generic on purpose: a title bar plus a few
 * rows reads correctly for both the list and detail screens.
 */
export default function AppLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Cargando">
      <div className={styles.titleRow}>
        <Skeleton className={styles.title} />
        <Skeleton className={styles.action} />
      </div>
      <div className={styles.rows}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className={styles.row} />
        ))}
      </div>
    </main>
  );
}
