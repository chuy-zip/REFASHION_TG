"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PromptSuggestions } from "@/components/designs/PromptSuggestions/PromptSuggestions";
import {
  INSTRUCTION_PLACEHOLDER,
  INSTRUCTION_SUGGESTIONS,
} from "@/lib/generation/prompt";
import styles from "./InstructionPanel.module.css";

interface InstructionPanelProps {
  instruction: string;
  onInstructionChange: (instruction: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
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
 * everything: turning a short sleeve into a long one failed with a mask, on a
 * mask that was verified correct, and succeeded by instruction on the same
 * photograph, because adding a garment feature is a semantic edit rather than a
 * fill (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 *
 * **What it costs, said out loud.** The instruction model re-renders the whole
 * frame. It keeps the person, but it reframes, redraws skin detail and distorts
 * anything printed on the garment. That last one is survivable here only
 * because logos are a separate layer composed afterwards, and the panel says so
 * rather than letting someone discover it in a result.
 *
 * **The suggestions are short on purpose, and they used to be long.** They
 * carried a clause listing what to preserve, which was dropped after running
 * the same order with and without it and getting materially the same result.
 * What stays is the warning the clause taught: anything a prompt names is
 * something the model may draw, so naming a garment detail to keep it is how a
 * removed emblem came back. The panel says that where it will be read.
 */
export function InstructionPanel({
  instruction,
  onInstructionChange,
  onGenerate,
  isGenerating,
  isSimulated,
  disabled = false,
}: InstructionPanelProps) {
  const fieldId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const canGenerate = !disabled && !isGenerating && instruction.trim().length >= 10;

  return (
    <div className={styles.panel}>
      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label className={styles.label} htmlFor={fieldId}>
            Qué quieres cambiar
          </label>
          <button
            type="button"
            className={styles.suggest}
            onClick={() => setSuggestionsOpen(true)}
            disabled={disabled || isGenerating}
          >
            Sugerencias
          </button>
        </div>
        <textarea
          id={fieldId}
          className={styles.instruction}
          rows={3}
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder={INSTRUCTION_PLACEHOLDER}
          disabled={disabled || isGenerating}
        />
        <p className={styles.hint}>
          Aquí no pintas nada. Describes el cambio y el modelo decide qué parte
          de la imagen toca.
        </p>
      </div>

      <PromptSuggestions
        title="Sugerencias para editar por instrucción"
        hint="Una instrucción es una orden, no una descripción. Di solo qué cambiar: no hace falta listar lo que debe quedarse igual, y nombrar un detalle de la prenda es pedirlo, aunque lo pidas para conservarlo."
        examples={INSTRUCTION_SUGGESTIONS}
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onUse={onInstructionChange}
      />

      <p className={styles.caution}>
        Este camino vuelve a dibujar la imagen completa. Conserva a la persona,
        pero reencuadra y deforma lo que esté estampado en la prenda. Los
        logotipos no se ven afectados porque se componen después, en su propia
        capa.
      </p>

      <p className={styles.hint}>
        Di solo qué quieres cambiar. No hace falta listar lo que debe quedarse
        igual, y cuidado con nombrar un detalle de la prenda: nombrarlo es
        pedirlo, así que te lo dibuja aunque ya lo hayas quitado.
      </p>

      <Button variant="primary" onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating ? "Generando…" : "Generar"}
      </Button>

      {/* Visible and not a tooltip on the disabled button, same reason as in the
          mask panel: a disabled control does not reliably fire hover and never
          does on touch. */}
      {!disabled && !isGenerating && instruction.trim().length < 10 && (
        <p className={styles.blocked}>
          Escribe qué quieres cambiar, con un poco de detalle.
        </p>
      )}

      <p className={styles.status}>
        {isSimulated ? (
          <>
            <span className={styles.pending}>Simulado</span>. No se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          "Este camino cuesta unas tres veces lo que una edición con máscara. El costo real se registra en el diseño."
        )}
      </p>
    </div>
  );
}
