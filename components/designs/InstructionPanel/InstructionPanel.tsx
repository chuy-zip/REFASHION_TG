"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PromptSuggestions } from "@/components/designs/PromptSuggestions/PromptSuggestions";
import {
  hasUnfilledSlot,
  INSTRUCTION_PLACEHOLDER,
  INSTRUCTION_SUGGESTIONS,
} from "@/lib/generation/prompt";
import { EDIT_COST_USD } from "@/lib/generation/pricing";
import styles from "./InstructionPanel.module.css";

// El precio antes del botón, con el mismo formato que las otras dos pantallas
// que gastan. Decía "unas tres veces una edición con máscara", que además de
// vago se quedó corto: medido, Kontext cobró entre 3.4 y 5.3 veces lo de Fill.
const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

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

  // One suggestion carries a slot, `[...]`, for the garment type. Sent as it
  // is, the brackets reach the model literally and the call is billed anyway.
  const slotPending = hasUnfilledSlot(instruction);
  const canGenerate =
    !disabled && !isGenerating && instruction.trim().length >= 10 && !slotPending;

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
      </div>

      <PromptSuggestions
        title="Sugerencias para editar por instrucción"
        hint="Una instrucción es una orden, no una descripción. Di solo qué cambiar: no hace falta listar lo que debe quedarse igual, y nombrar un detalle de la prenda es pedirlo, aunque lo pidas para conservarlo. Si una sugerencia tiene algo entre corchetes, cámbialo por tu prenda."
        examples={INSTRUCTION_SUGGESTIONS}
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onUse={onInstructionChange}
      />

      {/* Un solo aviso, y el que no se puede adivinar mirando la pantalla.
          Acá vivían tres párrafos: este, uno que repetía casi palabra por
          palabra la ayuda que ya está dentro de "Sugerencias" —no listes lo
          que debe quedarse igual, nombrar un detalle es pedirlo— y otro que
          decía lo mismo que la línea bajo la caja de texto. La regla del imán
          no se perdió: vive donde alguien la busca, que es el diálogo de
          sugerencias, a un clic. */}
      <p className={styles.caution}>
        Redibuja la imagen completa, no solo una zona: conserva a la persona,
        pero puede reencuadrar y deformar lo que esté estampado. Los logotipos
        no, porque se componen después.
      </p>

      <Button variant="primary" onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating ? "Generando…" : "Generar"}
      </Button>

      {/* Visible and not a tooltip on the disabled button, same reason as in the
          mask panel: a disabled control does not reliably fire hover and never
          does on touch. */}
      {!disabled && !isGenerating && instruction.trim().length < 10 && (
        <p className={styles.blocked}>Escribe qué quieres cambiar.</p>
      )}
      {!disabled && !isGenerating && slotPending && (
        <p className={styles.blocked}>
          Reemplaza lo que está entre corchetes antes de generar.
        </p>
      )}

      <p className={styles.status}>
        {isSimulated ? (
          <>
            <span className={styles.pending}>Simulado</span>. No se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          <>
            Cuesta unos <strong>{money.format(EDIT_COST_USD)}</strong> por
            edición. El costo real se registra en el diseño.
          </>
        )}
      </p>
    </div>
  );
}
