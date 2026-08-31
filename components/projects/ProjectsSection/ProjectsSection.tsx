import Link from "next/link";
import { ProjectSearch } from "@/components/projects/ProjectsSection/ProjectSearch";
import { Badge } from "@/components/ui/Badge/Badge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Pager } from "@/components/ui/Pager/Pager";
import type { ProjectSamples } from "@/lib/designs";
import { PROJECT_STATUS_COPY, PROJECTS_PAGE_SIZE } from "@/lib/projects";
import type { Project } from "@/lib/types";
import styles from "./ProjectsSection.module.css";

interface ProjectsSectionProps {
  /** The current page of projects. */
  projects: Project[];
  total: number;
  page: number;
  query: string;
  /** Sample strip per project id, capped in SQL at PROJECT_SAMPLE_SIZE. */
  samplesByProject: Map<string, ProjectSamples>;
  /** owner/editor (or admin) may create projects. */
  canManage: boolean;
}

/**
 * Projects of a client, shown inside the client's "Proyectos" tab.
 *
 * A project **is** its set of designs, so the card carries "la muestra": a
 * strip of its most recent designs. That is the middle level of the hierarchy,
 * where the images stop being borrowed (a client had none of its own) and are
 * not yet the whole card (a design *is* an image).
 *
 * The strip is a sample, not an inventory: it shows four and the line says how
 * many there are. Both numbers come from one query, and the four are chosen by
 * Postgres — see `fetchProjectSamples`.
 */
export function ProjectsSection({
  projects,
  total,
  page,
  query,
  samplesByProject,
  canManage,
}: ProjectsSectionProps) {
  // The box stays once a query exists, even with no matches: otherwise the only
  // control that could clear the search disappears with the results.
  const isSearchable = total > 0 || query.length > 0;

  return (
    <section>
      {isSearchable && (
        <div className={styles.toolbar}>
          <ProjectSearch query={query} />
        </div>
      )}

      {projects.length === 0 ? (
        query ? (
          <EmptyState
            title={`No se encontraron proyectos para "${query}".`}
            hint="Prueba con parte del nombre, o borra la búsqueda para verlos todos."
          />
        ) : (
          <EmptyState
            title="Sin proyectos aún"
            hint={
              canManage
                ? "Crea el primer proyecto para empezar a agregar diseños."
                : "Este cliente todavía no tiene proyectos."
            }
          />
        )
      ) : (
        <>
          <ul className={styles.list}>
            {projects.map((project) => {
              const strip = samplesByProject.get(project.id);
              const count = strip?.design_count ?? 0;
              const summary =
                count === 0
                  ? "Sin diseños aún"
                  : count === 1
                    ? "1 diseño"
                    : `${count} diseños`;

              return (
                <li key={project.id}>
                  <Link className={styles.card} href={`/projects/${project.id}`}>
                    <div className={styles.head}>
                      <div className={styles.headMain}>
                        <span className={styles.name}>{project.name}</span>
                        <span className={styles.sub}>
                          {summary}
                          {project.description ? ` · ${project.description}` : ""}
                        </span>
                      </div>
                      <Badge tone={PROJECT_STATUS_COPY[project.status].tone}>
                        {PROJECT_STATUS_COPY[project.status].label}
                      </Badge>
                    </div>

                    <div className={styles.strip}>
                      {count === 0 ? (
                        <span className={styles.stripEmpty}>
                          {canManage
                            ? "Crear el primero"
                            : "Todavía sin diseños"}
                        </span>
                      ) : (
                        /* Not trimmed here: the cap is the query's, and it is
                           the query's alone. Slicing again would be the same
                           decision written twice, and it would hide the day
                           the query stops applying it. */
                        strip?.samples.map((sample) => (
                          <div className={styles.swatch} key={sample.design_id}>
                            {sample.preview_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
                              <img
                                className={styles.swatchImage}
                                src={sample.preview_url}
                                crossOrigin="anonymous"
                                alt={sample.name}
                              />
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pager
            page={page}
            pageSize={PROJECTS_PAGE_SIZE}
            total={total}
            noun="proyectos"
          />
        </>
      )}
    </section>
  );
}
