import { AppTopBar } from "@/components/layout/AppTopBar/AppTopBar";
import styles from "./layout.module.css";

/**
 * App shell for every signed-in page: a persistent top bar plus the content
 * area. The bar renders once here, so route-level loading.tsx shows its
 * skeleton below a bar that never flickers.
 *
 * Auth is enforced upstream by proxy.ts; admin pages re-check the role.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <AppTopBar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
