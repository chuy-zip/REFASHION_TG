import Link from "next/link";
import { ProjectFormDialog } from "@/components/projects/ProjectFormDialog/ProjectFormDialog";
import { Badge } from "@/components/ui/Badge/Badge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { PROJECT_STATUS_COPY } from "@/lib/projects";
import type { Project } from "@/lib/types";
import styles from "./ProjectsSection.module.css";

interface ProjectsSectionProps {
  clientId: string;
  projects: Project[];
  /** owner/editor (or admin) may create projects. */
  canManage: boolean;
}

/**
 * Projects of a client, shown inside the client's "Proyectos" tab. Creating is
 * gated by canManage; each card links to the project detail (where designs live
 * in the next step).
 */
export function ProjectsSection({
  clientId,
  projects,
  canManage,
}: ProjectsSectionProps) {
  return (
    <section>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Proyectos</h2>
          <p className={styles.subtitle}>
            Cada proyecto agrupa los diseños de una orden o campaña.
          </p>
        </div>
        {canManage && (
          <ProjectFormDialog clientId={clientId} triggerLabel="Crear proyecto" />
        )}
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="Sin proyectos aún"
          hint={
            canManage
              ? "Crea el primer proyecto para empezar a agregar diseños."
              : "Este cliente todavía no tiene proyectos."
          }
        />
      ) : (
        <ul className={styles.list}>
          {projects.map((project) => (
            <li key={project.id}>
              <Link className={styles.card} href={`/projects/${project.id}`}>
                <div className={styles.cardMain}>
                  <span className={styles.cardName}>{project.name}</span>
                  {project.description && (
                    <span className={styles.cardDesc}>
                      {project.description}
                    </span>
                  )}
                </div>
                <Badge tone={PROJECT_STATUS_COPY[project.status].tone}>
                  {PROJECT_STATUS_COPY[project.status].label}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
