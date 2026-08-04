import { DesignFormDialog } from "@/components/designs/DesignFormDialog/DesignFormDialog";
import { DesignActionsMenu } from "@/components/designs/DesignActionsMenu/DesignActionsMenu";
import { Badge } from "@/components/ui/Badge/Badge";
import {
  DESIGN_STATUS_COPY,
  garmentTypeLabel,
  type DesignOption,
} from "@/lib/designs";
import type { AssetWithUrl } from "@/lib/assets";
import type { Design } from "@/lib/types";
import styles from "./DesignsSection.module.css";

interface DesignsSectionProps {
  projectId: string;
  designs: Design[];
  /** Client's catalog images, offered as a starting point when creating. */
  assets: AssetWithUrl[];
  /** The same designs with previews resolved, offered as iteration parents. */
  designOptions: DesignOption[];
  /** owner/editor (or admin) of the parent client may create/edit/delete. */
  canManage: boolean;
}

/**
 * Designs of a project. Each row shows the garment and version; the gear menu
 * handles edit/delete inline. Creating a design lands on its editing screen
 * (`/designs/[id]/edit`), not back on this list.
 */
export function DesignsSection({
  projectId,
  designs,
  assets,
  designOptions,
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
          <DesignFormDialog
            projectId={projectId}
            assets={assets}
            designs={designOptions}
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
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{design.name}</span>
                <span className={styles.rowMeta}>
                  {garmentTypeLabel(design.garment_type)} · v{design.version}
                </span>
              </div>
              <div className={styles.rowActions}>
                <Badge tone={DESIGN_STATUS_COPY[design.status].tone}>
                  {DESIGN_STATUS_COPY[design.status].label}
                </Badge>
                <DesignActionsMenu design={design} canEdit={canManage} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
