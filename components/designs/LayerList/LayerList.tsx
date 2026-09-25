"use client";

import { Button } from "@/components/ui/Button/Button";
import type { LayerWithUrl } from "@/lib/layers";
import styles from "./LayerList.module.css";

interface LayerListProps {
  layers: LayerWithUrl[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  /** Layers whose image failed to load, so the row can say so. */
  brokenIds: Set<string>;
  /** A cut is on screen; only the layer being cut stays reachable. */
  cutLayerId: string | null;
  canEdit: boolean;
}

/**
 * The layers on the garment, topmost first.
 *
 * Sorted by `z_index` descending because that is how they are stacked on the
 * canvas, and a list reading bottom-up would disagree with what is on screen.
 * The sort is on a copy: `layers` belongs to the workspace.
 *
 * A layer whose image failed says so **in its own row** rather than through a
 * toast, because it is a property of that layer and not an event: it is still
 * true five minutes later, and the row is where someone looks to find out.
 */
export function LayerList({
  layers,
  selectedId,
  onSelect,
  onRemove,
  brokenIds,
  cutLayerId,
  canEdit,
}: LayerListProps) {
  if (layers.length === 0) {
    return (
      <p className={styles.hint}>
        Elige un logotipo de arriba para colocarlo sobre la prenda.
      </p>
    );
  }

  const isCutting = cutLayerId !== null;

  return (
    <ul className={styles.layerList}>
      {[...layers]
        .sort((a, b) => b.z_index - a.z_index)
        .map((layer) => {
          const isBroken = brokenIds.has(layer.id);
          return (
            <li key={layer.id} className={styles.layerItem}>
              <button
                type="button"
                className={`${styles.layerName} ${
                  selectedId === layer.id ? styles.layerSelected : ""
                }`}
                onClick={() => onSelect(layer.id)}
                disabled={isCutting && cutLayerId !== layer.id}
                title={
                  isBroken
                    ? "La imagen de esta capa no se pudo cargar."
                    : layer.name
                }
              >
                {layer.name}
                {isBroken ? " · no cargó" : ""}
              </button>
              <Button
                variant="ghost"
                onClick={() => onRemove(layer.id)}
                disabled={!canEdit || isCutting}
                title="Quitar la capa (el logotipo sigue en el catálogo)"
              >
                Quitar
              </Button>
            </li>
          );
        })}
    </ul>
  );
}
