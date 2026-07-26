import { projectStatusLabel } from "@/lib/projects";
import type { ProjectStatus } from "@/lib/types";
import styles from "./StatusBadge.module.css";

/** Small colored label for a project's status. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      {projectStatusLabel(status)}
    </span>
  );
}
