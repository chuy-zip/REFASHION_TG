import Link from "next/link";
import { DesignWizard } from "@/components/designs/DesignWizard/DesignWizard";
import { DesignActionsMenu } from "@/components/designs/DesignActionsMenu/DesignActionsMenu";
import { DesignSearch } from "@/components/designs/DesignsSection/DesignSearch";
import { Badge } from "@/components/ui/Badge/Badge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Pager } from "@/components/ui/Pager/Pager";
import { Thumbnail } from "@/components/ui/Thumbnail/Thumbnail";
import {
  DESIGNS_PAGE_SIZE,
  DESIGN_STATUS_COPY,
  garmentTypeLabel,
  type DesignWithPreview,
} from "@/lib/designs";
import styles from "./DesignsSection.module.css";

interface DesignsSectionProps {
  clientId: string;
  projectId: string;
  /** The current page of designs, already filtered by `query`. */
  designs: DesignWithPreview[];
  /** Matches before paging, for the pager. */
  total: number;
  page: number;
  query: string;
  /** owner/editor (or admin) of the parent client may create/edit/delete. */
  canManage: boolean;
}

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Designs of a project. Each card links to the design's hub (`/designs/[id]`),
 * which is read-only: looking at a design must not put anyone in an editor.
 * The gear menu handles its *data* (name, garment, status) and deletion inline;
 * that is a different sense of "editar" from the working screen, which is why
 * the menu item says "Editar datos".
 *
 * The card **is** the image. This is the last level of the hierarchy, where the
 * distance between the label and the image reaches zero, so it takes the same
 * shape as the catalog rather than a bordered row. The
 * preview is the design's latest composition, or its working image when it has
 * composed nothing yet — what a design *looks like* includes its logos.
 *
 * Searching and paging both happen on the server and both live in the URL, so
 * the twelve previews on screen are the only images this page ever resolves.
 */
export function DesignsSection({
  clientId,
  projectId,
  designs,
  total,
  page,
  query,
  canManage,
}: DesignsSectionProps) {
  // The box stays once a query exists, even with no matches: otherwise the only
  // control that could clear the search disappears with the results.
  const isSearchable = total > 0 || query.length > 0;

  return (
    <section>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Diseños</h2>
          <p className={styles.subtitle}>
            Cada diseño es una prenda que se prototipa dentro del proyecto.
          </p>
        </div>
        {canManage && (
          <DesignWizard
            context={{ clientId, projectId }}
            triggerLabel="Crear diseño"
          />
        )}
      </div>

      {isSearchable && (
        <div className={styles.toolbar}>
          <DesignSearch query={query} />
        </div>
      )}

      {designs.length === 0 ? (
        query ? (
          <EmptyState
            title={`No se encontraron diseños para "${query}".`}
            hint="Prueba con parte del nombre, o borra la búsqueda para verlos todos."
          />
        ) : (
          <EmptyState
            title="Sin diseños aún"
            hint={
              canManage
                ? "Crea el primer diseño para empezar a agregar imágenes."
                : "Este proyecto todavía no tiene diseños."
            }
          />
        )
      ) : (
        <>
          <ul className={styles.list}>
            {designs.map((design) => (
              <li key={design.id} className={styles.card}>
                <Link className={styles.link} href={`/designs/${design.id}`}>
                  <Thumbnail
                    src={design.preview_url}
                    alt={design.name}
                    emptyLabel="Sin prenda base"
                  />

                  <div className={styles.meta}>
                    <div className={styles.metaTop}>
                      <span className={styles.name}>{design.name}</span>
                      <Badge tone={DESIGN_STATUS_COPY[design.status].tone}>
                        {DESIGN_STATUS_COPY[design.status].label}
                      </Badge>
                    </div>
                    <span className={styles.sub}>
                      {garmentTypeLabel(design.garment_type)} · v
                      {design.version}
                      {/* Iterations share their parent's name on purpose, so
                          the note is what tells two versions apart. */}
                      {design.notes ? ` · ${design.notes}` : ""}
                    </span>
                    <span className={styles.when}>
                      Actualizado el{" "}
                      {dateFormat.format(new Date(design.last_activity))}
                    </span>
                  </div>
                </Link>

                {/* Outside the link: a <button> cannot live inside an <a>. It
                    floats over the thumbnail, like the catalog's. */}
                <div className={styles.menu}>
                  <DesignActionsMenu
                    design={design}
                    canEdit={canManage}
                    assetCount={design.asset_count}
                  />
                </div>
              </li>
            ))}
          </ul>

          <Pager
            page={page}
            pageSize={DESIGNS_PAGE_SIZE}
            total={total}
            noun="diseños"
          />
        </>
      )}
    </section>
  );
}
