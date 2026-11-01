"use client";

import { Icon } from "@/components/ui/Icon/Icon";
import { BRUSH_SIZES } from "@/lib/mask";
import styles from "./MaskTools.module.css";

/**
 * What the pointer does.
 *
 * `brush` and `flat` both paint the same region; they differ in what the region
 * BECOMES. The fabric brush keeps the garment's shading, so the result still
 * reads as cloth. The flat brush throws the shading away, which is the point:
 * it is for covering something up before a model sees it, and the measurements
 * showed that leaving the original structure under a mask is exactly what
 * leaves a ghost of it in the result.
 *
 * `picker` paints nothing. It reads a colour out of the garment, which is what
 * makes covering a patch match the cloth around it.
 */
export type MaskTool = "brush" | "flat" | "eraser" | "picker";

interface MaskToolsProps {
  tool: MaskTool;
  onToolChange: (tool: MaskTool) => void;
  /** Brush diameter as a ratio of the image width; one of `BRUSH_SIZES`. */
  brush: number;
  onBrushChange: (brush: number) => void;
  onClear: () => void;
  /** Steps back one gesture: a stroke, a clear, an automatic selection. */
  onUndo: () => void;
  /** Nothing to step back to. */
  canUndo: boolean;
  /**
   * Picks the whole garment at once, by telling it apart from the background.
   *
   * Absent when the mode has no use for it. The selection returns the garment's
   * whole silhouette, which is the question recolouring asks and not the one
   * inpainting asks, so it is offered while painting and withheld while marking
   * a zone.
   */
  onSelectGarment?: () => void;
  /**
   * Why the selection cannot work on this image. Present means the tool is
   * shown disabled with this as its explanation, rather than hidden: a control
   * that is there but greyed says "not for this image", where absence says
   * nothing at all.
   *
   * The wrapper carries the tooltip because a disabled button does not fire
   * hover events in every browser. The same sentence is repeated in the panel,
   * where there is room to read it without a pointer.
   */
  selectGarmentBlockedReason?: string;
  /**
   * Which tools this mode has any use for.
   *
   * Marking a zone for the model has no business with a flat fill or an
   * eyedropper: those change pixels, and that mode does not. Passing the list
   * rather than a mode name keeps the rail from having to know what the modes
   * are called.
   */
  tools?: MaskTool[];
  /**
   * What the brush means here, because the same stroke does two different
   * things and only the label can say which.
   *
   * The rail is shared: while painting, a stroke recolours cloth and keeps its
   * shading; while marking a zone, the identical stroke changes no pixel at all
   * and only tells the model where it may work. The tooltip used to describe
   * the first one in both places, so in the second it described something that
   * was not happening.
   *
   * It is not the mode name: the rail still does not know what the modes are
   * called, only what its own brush does.
   */
  brushAction?: "recolor" | "mask";
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
 * left-hand rail — the workspace keeps a single right rail for module
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
  onUndo,
  canUndo,
  onSelectGarment,
  selectGarmentBlockedReason,
  tools = ["brush", "eraser"],
  brushAction = "mask",
  isEmpty,
  disabled = false,
}: MaskToolsProps) {
  const brushCopy =
    brushAction === "recolor"
      ? {
          label: "Pincel de tela",
          title: "Pincel de tela: cambia el color y conserva los pliegues",
        }
      : {
          label: "Pincel",
          title: "Pincel: marca la zona donde la IA puede trabajar",
        };

  return (
    <div className={styles.rail} role="group" aria-label="Herramientas de máscara">
      {/* First, and set apart, because it is where painting starts: it lays
          down the whole garment and the brush and eraser correct it. Not
          aria-pressed like the two below it — this one acts and is done, it
          does not stay chosen. */}
      {onSelectGarment && (
        <>
          <span title={selectGarmentBlockedReason ?? "Seleccionar toda la prenda"}>
            <button
              type="button"
              className={styles.tool}
              aria-label="Seleccionar toda la prenda"
              disabled={disabled || Boolean(selectGarmentBlockedReason)}
              onClick={onSelectGarment}
            >
              <Icon name="autoSelect" size={22} />
            </button>
          </span>

          <div className={styles.divider} />
        </>
      )}

      {tools.includes("brush") && (
        <button
          type="button"
          className={styles.tool}
          aria-pressed={tool === "brush"}
          aria-label={brushCopy.label}
          title={brushCopy.title}
          disabled={disabled}
          onClick={() => onToolChange("brush")}
        >
          <Icon name="brush" size={22} />
        </button>
      )}

      {tools.includes("flat") && (
        <button
          type="button"
          className={styles.tool}
          aria-pressed={tool === "flat"}
          aria-label="Pincel plano"
          title="Pincel plano: tapa la zona con color liso, sin pliegues"
          disabled={disabled}
          onClick={() => onToolChange("flat")}
        >
          <Icon name="fill" size={22} />
        </button>
      )}

      {tools.includes("picker") && (
        <button
          type="button"
          className={styles.tool}
          aria-pressed={tool === "picker"}
          aria-label="Gotero"
          title="Gotero: toma un color de la prenda"
          disabled={disabled}
          onClick={() => onToolChange("picker")}
        >
          <Icon name="eyedropper" size={22} />
        </button>
      )}

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

      {/* Beside the thing it most often has to fix. Painting is a gesture that
          goes wrong, and until this existed the only ways back were the eraser
          — which is a different gesture, not an undo — and clearing everything,
          which is what people were pressing by accident in the first place. */}
      <button
        type="button"
        className={styles.tool}
        aria-label="Deshacer"
        title={canUndo ? "Deshacer" : "No hay nada que deshacer"}
        disabled={disabled || !canUndo}
        onClick={onUndo}
      >
        <Icon name="undo" size={22} />
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
