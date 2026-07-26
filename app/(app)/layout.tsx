import { AppSidebar } from "@/components/layout/AppSidebar/AppSidebar";
import styles from "./layout.module.css";

/**
 * App shell for every signed-in page: a persistent left sidebar plus the content
 * area. The sidebar renders once here, so route-level loading.tsx shows its
 * skeleton in the content area beside a sidebar that never flickers.
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
      <AppSidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
