"use client";

import { Icon } from "@/components/ui/Icon/Icon";
import { BRUSH_SIZES } from "@/lib/mask";
import styles from "./MaskTools.module.css";

export type MaskTool = "brush" | "eraser";

interface MaskToolsProps {
  tool: MaskTool;
  onToolChange: (tool: MaskTool) => void;
  /** Brush diameter as a ratio of the image width; one of `BRUSH_SIZES`. */
  brush: number;
  onBrushChange: (brush: number) => void;
  onClear: () => void;
  /** Picks the whole garment at once, by telling it apart from the background. */
  onSelectGarment: () => void;
  /** Nothing painted yet: clearing would do nothing and says so. */
  isEmpty: boolean;
  disabled?: boolean;
}

/**
 * The mask painter's tool rail.
 *
 * A rail and not another panel: painting means switching between brush and
 * eraser constantly, and a control you reach for that often belongs where the
 * hand already is. That is also why it is the one place in the app with a
 * left-hand rail — `FASE_1_5` §7.5 kept a single right rail for module
 * *panels*, and this is a tool selector, which is a different thing.
 *
 * Presentational on purpose: the mask lives in the workspace, because the
 * canvas, the recolour preview and the generation request all read it. A rail
 * that owned it would make itself the only way to reach it. That holds for the
 * automatic selection too — the rail asks for it, it does not compute it: the
 * fill needs the working image, which is the canvas's business, not the rail's.
 */
export function MaskTools({
  tool,
  onToolChange,
  brush,
  onBrushChange,
  onClear,
  onSelectGarment,
  isEmpty,
  disabled = false,
}: MaskToolsProps) {
  return (
    <div className={styles.rail} role="group" aria-label="Herramientas de máscara">
      {/* First, and set apart, because it is where painting starts: it lays
          down the whole garment and the brush and eraser correct it. Not
          aria-pressed like the two below it — this one acts and is done, it
          does not stay chosen. */}
      <button
        type="button"
        className={styles.tool}
        aria-label="Seleccionar toda la prenda"
        title="Seleccionar toda la prenda"
        disabled={disabled}
        onClick={onSelectGarment}
      >
        <Icon name="autoSelect" size={22} />
      </button>

      <div className={styles.divider} />

      <button
        type="button"
        className={styles.tool}
        aria-pressed={tool === "brush"}
        aria-label="Pincel"
        title="Pincel"
        disabled={disabled}
        onClick={() => onToolChange("brush")}
      >
        <Icon name="brush" size={22} />
      </button>

      <button
        type="button"
        className={styles.tool}
        aria-pressed={tool === "eraser"}
        aria-label="Goma"
        title="Goma"
        disabled={disabled}
        onClick={() => onToolChange("eraser")}
      >
        <Icon name="eraser" size={22} />
      </button>

      <button
        type="button"
        className={styles.tool}
        aria-label="Limpiar la máscara"
        title={isEmpty ? "No hay nada pintado" : "Limpiar la máscara"}
        disabled={disabled || isEmpty}
        onClick={onClear}
      >
        <Icon name="trash" size={22} />
      </button>

      <div className={styles.divider} />

      {/* The sizes are shown at their real proportion to each other, so the
          choice is made by looking rather than by reading a number. */}
      <span className={styles.label}>Grosor</span>
      <div
        className={styles.sizes}
        role="group"
        aria-label="Grosor del pincel"
      >
        {BRUSH_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={styles.size}
            aria-pressed={brush === size}
            aria-label={`Grosor ${Math.round(size * 100)}%`}
            disabled={disabled}
            onClick={() => onBrushChange(size)}
          >
            <span
              className={styles.dot}
              style={{ width: `${size * 130}px`, height: `${size * 130}px` }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
