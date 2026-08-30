"use client";

import { useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/Button/Button";
import { parseHex } from "@/lib/recolor";
import styles from "./ColorPanel.module.css";

interface ColorPanelProps {
  /** Always a valid hex: the panel never reports anything else. */
  color: string;
  onColorChange: (color: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  /** Nothing painted: there is no region to recolour yet. */
  hasMask: boolean;
  isApplying: boolean;
  disabled?: boolean;
}

/**
 * Picking the exact colour of the garment.
 *
 * A picker and not a text field, and the reason is not convenience:
 * `FASE_2_INPAINTING` §2.3 found that **diffusion models do not honour colour
 * codes reliably** — an open research problem, not a limitation of one
 * provider. In a quoting tool the colour is the deliverable, so this path never
 * asks a model: it recolours the pixels directly and the hex that comes out is
 * the hex that went in.
 *
 * Which is why there is no "generate" button here. The preview follows the
 * picker as it moves, because it costs nothing and takes no time — and a
 * control that could update live but waits for a click reads as slower than it
 * is. `Aplicar` is not "run it", it is "keep this one".
 */
export function ColorPanel({
  color,
  onColorChange,
  onApply,
  onDiscard,
  hasMask,
  isApplying,
  disabled = false,
}: ColorPanelProps) {
  const hexId = useId();

  // The field holds what is being TYPED; the parent holds what has been
  // CHOSEN. Half a hex is not a colour, so it must never leave here — otherwise
  // the canvas would repaint on every keystroke of `#1D4` and the picker would
  // jump somewhere arbitrary while the user is still typing.
  //
  // This is also what keeps a literal fallback out of the file: the parent's
  // colour is valid by construction, so there is never a moment that needs one.
  const [draft, setDraft] = useState(color);
  const isValid = parseHex(draft) !== null;

  function handleTyping(value: string) {
    setDraft(value);
    const parsed = parseHex(value);
    if (parsed) onColorChange(value.trim().toUpperCase());
  }

  function handlePicker(value: string) {
    setDraft(value.toUpperCase());
    onColorChange(value.toUpperCase());
  }

  return (
    <div className={styles.panel}>
      <div className={styles.picker}>
        <HexColorPicker color={color} onChange={handlePicker} />
      </div>

      <div className={styles.hexRow}>
        <span
          className={styles.swatch}
          style={{ background: color }}
          aria-hidden="true"
        />
        <label className={styles.hexLabel} htmlFor={hexId}>
          Color
        </label>
        <input
          id={hexId}
          className={styles.hex}
          value={draft}
          onChange={(event) => handleTyping(event.target.value)}
          // A colour code is not prose, and it is the value the client
          // approves: autocorrect and spellcheck have no business here.
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-invalid={!isValid}
          aria-label="Código de color hexadecimal"
          disabled={disabled}
        />
      </div>

      {/* Nothing here appears, disappears or changes length between states.
          The panel used to swap a one-line sentence for a three-line one and
          grow a row of buttons on the first stroke — which resized the rail,
          and with it the canvas, in the middle of the gesture that created it.

          So the sentence is one that is true either way, and the actions are
          always present and simply disabled until there is a region to apply
          them to. The reason is on the button itself rather than in prose that
          comes and goes. */}
      <p className={styles.hint}>
        Se aplica mientras eliges. Conserva los pliegues y las sombras, y el
        color es exactamente el que pediste.
      </p>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={onApply}
          disabled={disabled || isApplying || !hasMask}
          title={
            hasMask
              ? undefined
              : "Pinta primero la zona de la prenda que quieres cambiar"
          }
        >
          {isApplying ? "Guardando…" : "Aplicar"}
        </Button>
        <Button onClick={onDiscard} disabled={isApplying || !hasMask}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
