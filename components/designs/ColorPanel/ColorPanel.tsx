"use client";

import { useId, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/Button/Button";
import { Disclosure } from "@/components/ui/Disclosure/Disclosure";
import { Icon } from "@/components/ui/Icon/Icon";
import { hslToRgb, parseHex, rgbToHsl, toHex, type Hsl } from "@/lib/recolor";
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
 *
 * **Three ways in, because they are three different jobs.** The square is for
 * finding a colour, the hex is for entering one that was already decided — a
 * brand colour arrives as a code, not as a feeling — and the three axes below
 * are for *moving* one: same blue, a bit lighter. That last job is the one the
 * square does worst, because dragging inside it changes saturation and
 * lightness together and there is no way to hold one still.
 *
 * Lightness in particular earns its slider. `lib/recolor.ts` bounds the fold
 * contrast by how much room there is between the colour and white, so how light
 * a colour is decides how much of the garment's texture survives the recolour.
 * It is the one axis whose value the user can see the consequence of.
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

  // The same tag-and-derive as everywhere else in the workspace (APRENDIZAJES
  // §5.14), and here it prevents a specific annoyance: HSL and RGB do not map
  // one to one, so converting out and back rounds. Without the tag, dragging
  // the hue across a grey — where every hue gives the same colour — would keep
  // snapping the thumb back to zero, and a slider that fights the finger is
  // worse than no slider.
  //
  // While the tag matches, the axes are exactly what the user set. The moment
  // the colour comes from anywhere else (the square, the hex, the parent), it
  // stops matching and the axes are read back off the colour.
  const [axes, setAxes] = useState<{ hex: string; hsl: Hsl } | null>(null);

  const session = axes && axes.hex === color ? axes : null;

  const hsl = session
    ? session.hsl
    : // The prop is a valid hex by construction — this panel is the only thing
      // that reports one. The fallback is for the impossible case, and it is a
      // number rather than a colour, so no palette leaks in here.
      rgbToHsl(parseHex(color) ?? { r: 0, g: 0, b: 0 });

  // The colour this panel opened with: a fixed point, kept for its whole life.
  //
  // The first version of the reset went back to "the colour from before you
  // touched the axes", which is the cleverer answer and the wrong one. Someone
  // who had already picked a colour with the square and then got lost in the
  // axes pressed it and did not land on the numbers they remembered — because
  // the button was undoing a step, and what they wanted was a place to stand.
  //
  // A reset that means something different depending on what happened earlier
  // is not a reset. This one always goes to the same colour, and it says which.
  const [initialColor] = useState(color);
  const initialHsl = rgbToHsl(parseHex(initialColor) ?? { r: 0, g: 0, b: 0 });

  // Hex is case-insensitive: the picker reports uppercase and a CSS variable is
  // usually written lowercase, so comparing the strings raw would leave the
  // button lit on a colour that already IS the initial one.
  const canReset =
    color.trim().toUpperCase() !== initialColor.trim().toUpperCase();

  function handleAxis(axis: keyof Hsl, value: number) {
    if (Number.isNaN(value)) return;
    const next = { ...hsl, [axis]: value };
    const hex = toHex(hslToRgb(next));
    setAxes({ hex, hsl: next });
    setDraft(hex);
    onColorChange(hex);
  }

  /**
   * Back to the colour the panel opened with.
   *
   * The three axes are easy to move and hard to walk back by hand: there is no
   * value to type in to undo them, because the value the user wants is the one
   * they had before they started, and by then they no longer know what it was.
   */
  function handleReset() {
    setAxes(null);
    setDraft(initialColor);
    onColorChange(initialColor);
  }

  function handleTyping(value: string) {
    setDraft(value);
    const parsed = parseHex(value);
    if (parsed) onColorChange(value.trim().toUpperCase());
  }

  function handlePicker(value: string) {
    setDraft(value.toUpperCase());
    onColorChange(value.toUpperCase());
  }

  // Built rather than written down: a rainbow spelled out as seven hex stops
  // would be seven colours living outside globals.css (§5.1). These are
  // computed from the value the slider selects, which is what makes the track
  // a picture of the control instead of a decoration.
  const hueTrack = `linear-gradient(to right, ${Array.from(
    { length: 7 },
    (_, step) => `hsl(${step * 60} 100% 50%)`
  ).join(", ")})`;
  const saturationTrack = `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`;
  const lightnessTrack = `linear-gradient(to right, hsl(${hsl.h} ${hsl.s}% 0%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 100%))`;

  const AXES: {
    axis: keyof Hsl;
    label: string;
    max: number;
    unit: string;
    track: string;
  }[] = [
    { axis: "h", label: "Matiz", max: 360, unit: "°", track: hueTrack },
    { axis: "s", label: "Saturación", max: 100, unit: "%", track: saturationTrack },
    { axis: "l", label: "Luminosidad", max: 100, unit: "%", track: lightnessTrack },
  ];

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

      {/* Folded away, and closed by default, because most of the time the
          square and the hex field are the whole job. Someone who does not know
          what a matiz is should not meet one on the way to picking a colour —
          and someone who does knows exactly where to look for it. */}
      <Disclosure label="Opciones avanzadas">
      <div className={styles.axes} role="group" aria-label="Ajuste fino del color">
        {AXES.map(({ axis, label, max, unit, track }) => {
          const value = Math.round(hsl[axis]);
          return (
            <div className={styles.axis} key={axis}>
              <div className={styles.axisHead}>
                <label className={styles.axisLabel} htmlFor={`${hexId}-${axis}`}>
                  {label}
                </label>
                {/* A number as well as a slider: the slider is for moving the
                    colour and the number is for landing on a value that was
                    decided elsewhere. Neither can do the other's job. */}
                <span className={styles.axisValue}>
                  <input
                    className={styles.axisNumber}
                    type="number"
                    min={0}
                    max={max}
                    value={value}
                    onChange={(event) =>
                      handleAxis(axis, Number(event.target.value))
                    }
                    aria-label={`${label}, valor exacto`}
                    // Not a field a password manager has any business filling:
                    // it is a number between 0 and 360.
                    autoComplete="off"
                    disabled={disabled}
                  />
                  {unit}
                </span>
              </div>
              <input
                id={`${hexId}-${axis}`}
                className={styles.axisSlider}
                type="range"
                min={0}
                max={max}
                step={1}
                value={value}
                style={{ backgroundImage: track }}
                onChange={(event) => handleAxis(axis, Number(event.target.value))}
                disabled={disabled}
              />
            </div>
          );
        })}

        {/* Inside the fold, after the three things it puts back, and an icon
            rather than a word: it belongs to the group above it, and a labelled
            button here would compete with `Aplicar` and `Descartar` below —
            which act on the design, while this one only tidies up a control.

            Disabled until there is something to undo, so it never promises a
            change it would not make. */}
        <div className={styles.axesFooter}>
          <button
            type="button"
            className={styles.reset}
            onClick={handleReset}
            disabled={disabled || !canReset}
            aria-label={`Volver al color inicial, matiz ${Math.round(
              initialHsl.h
            )} grados, saturación ${Math.round(
              initialHsl.s
            )} por ciento, luminosidad ${Math.round(initialHsl.l)} por ciento`}
            // An icon on its own cannot say where it leads, so the tooltip
            // names the exact place: the same three numbers the axes show, so
            // the promise and the result are read in the same units.
            title={
              canReset
                ? `Volver al color inicial (${Math.round(
                    initialHsl.h
                  )}°, ${Math.round(initialHsl.s)}%, ${Math.round(
                    initialHsl.l
                  )}%)`
                : "Ya estás en el color inicial"
            }
          >
            <Icon name="reset" size={18} />
          </button>
        </div>
      </div>
      </Disclosure>

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
