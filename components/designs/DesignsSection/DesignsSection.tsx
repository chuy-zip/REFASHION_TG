import Link from "next/link";
import { DesignWizard } from "@/components/designs/DesignWizard/DesignWizard";
import { DesignActionsMenu } from "@/components/designs/DesignActionsMenu/DesignActionsMenu";
import { Badge } from "@/components/ui/Badge/Badge";
import { DESIGN_STATUS_COPY, garmentTypeLabel } from "@/lib/designs";
import type { Design } from "@/lib/types";
import styles from "./DesignsSection.module.css";

interface DesignsSectionProps {
  clientId: string;
  projectId: string;
  designs: Design[];
  /** owner/editor (or admin) of the parent client may create/edit/delete. */
  canManage: boolean;
}

/**
 * Designs of a project. Each row links to the design's hub (`/designs/[id]`),
 * which is read-only: looking at a design must not put anyone in an editor.
 * The gear menu handles its *data* (name, garment, status) and deletion inline;
 * that is a different sense of "editar" from the working screen, which is why
 * the menu item says "Editar datos".
 */
export function DesignsSection({
  clientId,
  projectId,
  designs,
  canManage,
}: DesignsSectionProps) {
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

      {designs.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Sin diseños aún</p>
          <p className={styles.emptyHint}>
            {canManage
              ? "Crea el primer diseño para empezar a agregar imágenes."
              : "Este proyecto todavía no tiene diseños."}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {designs.map((design) => (
            <li key={design.id} className={styles.row}>
              <Link className={styles.rowMain} href={`/designs/${design.id}`}>
                <span className={styles.rowName}>{design.name}</span>
                <span className={styles.rowMeta}>
                  {garmentTypeLabel(design.garment_type)} · v{design.version}
                </span>
              </Link>
              <div className={styles.rowActions}>
                <Badge tone={DESIGN_STATUS_COPY[design.status].tone}>
                  {DESIGN_STATUS_COPY[design.status].label}
                </Badge>
                <span className={styles.rowMenu}>
                  <DesignActionsMenu design={design} canEdit={canManage} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
