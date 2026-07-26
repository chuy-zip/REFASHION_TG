import { DesignFormDialog } from "@/components/designs/DesignFormDialog/DesignFormDialog";
import { DesignActionsMenu } from "@/components/designs/DesignActionsMenu/DesignActionsMenu";
import { garmentTypeLabel } from "@/lib/designs";
import type { Design } from "@/lib/types";
import styles from "./DesignsSection.module.css";

interface DesignsSectionProps {
  projectId: string;
  designs: Design[];
  /** owner/editor (or admin) of the parent client may create/edit/delete. */
  canManage: boolean;
}

/**
 * Designs of a project. Each row shows the garment and version; the gear menu
 * handles edit/delete inline — there is no design detail page yet (that lands
 * with the assets step).
 */
export function DesignsSection({
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
          <DesignFormDialog projectId={projectId} triggerLabel="Crear diseño" />
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
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{design.name}</span>
                <span className={styles.rowMeta}>
                  {garmentTypeLabel(design.garment_type)} · v{design.version}
                </span>
              </div>
              <DesignActionsMenu design={design} canEdit={canManage} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
