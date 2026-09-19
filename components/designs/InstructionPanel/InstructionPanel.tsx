"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button/Button";
import styles from "./InstructionPanel.module.css";

interface InstructionPanelProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  disabled?: boolean;
}

/**
 * Editing by instruction: no mask, the model decides which pixels to touch.
 *
 * **A mode of its own rather than a third option inside the mask panel**, and
 * that is the whole point of it being here. The two AI paths differ in the one
 * thing the user has to get right: one acts only where you painted, the other
 * acts wherever it judges. Offering them side by side under a shared brush
 * invites asking for a masked edit and getting a whole-image one.
 *
 * **Why it exists at all.** The measurements said the mask path cannot do
 * everything: turning a short sleeve into a long one failed with a mask and
 * succeeded by instruction, on the same photograph, because adding a garment
 * feature is a semantic edit rather than a fill
 * (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 *
 * **What it costs, said out loud.** The instruction model re-renders the whole
 * frame. It keeps the person, but it reframes, redraws skin detail and distorts
 * anything printed on the garment. That last one is survivable here only
 * because logos are a separate layer composed afterwards, and the panel says so
 * rather than letting someone discover it in a result.
 *
 * Not connected yet: `getGenerationProvider()` still answers with the
 * simulator, and no provider implements a maskless edit. The panel exists so
 * the mode is real and the copy can be read before anything is spent.
 */
export function InstructionPanel({
  instruction,
  onInstructionChange,
  disabled = false,
}: InstructionPanelProps) {
  const fieldId = useId();

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId}>
          Qué quieres cambiar
        </label>
        <textarea
          id={fieldId}
          className={styles.instruction}
          rows={3}
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="haz las mangas largas, con puño de punto…"
          disabled={disabled}
        />
        <p className={styles.hint}>
          Aquí no pintas nada. Describes el cambio y el modelo decide qué parte
          de la imagen toca.
        </p>
      </div>

      <p className={styles.caution}>
        Este camino vuelve a dibujar la imagen completa. Conserva a la persona,
        pero reencuadra y deforma lo que esté estampado en la prenda. Los
        logotipos no se ven afectados porque se componen después, en su propia
        capa.
      </p>

      <Button variant="primary" disabled>
        Generar
      </Button>

      <p className={styles.status}>
        <span className={styles.pending}>Sin conectar</span>. Este modo todavía
        no llama a ningún servicio.
      </p>
    </div>
  );
}
