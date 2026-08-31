"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { PROMPT_PLACEHOLDER } from "@/lib/generation/prompt";
import type { InpaintIntent } from "@/lib/generation/types";
import styles from "./GenerationPanel.module.css";

/** What the generative path is asked to change. Colour has its own, exact way. */
export type GenerativeIntent = Exclude<InpaintIntent, "color">;

interface GenerationPanelProps {
  intent: GenerativeIntent;
  onIntentChange: (intent: GenerativeIntent) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  strength: number;
  onStrengthChange: (strength: number) => void;
  onGenerate: () => void;
  hasMask: boolean;
  isGenerating: boolean;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
  disabled?: boolean;
}

/**
 * The generative half of Módulo 2: what the colour picker cannot do.
 *
 * Shape and texture, never colour. A diffusion model does not honour a colour
 * code reliably — an open research problem, not a limitation of one provider —
 * so asking it for "azul marino" when an exact recolour is one panel away would
 * be choosing the imprecise tool on purpose (`FASE_2_INPAINTING` §2.3).
 *
 * **The cost is shown before spending, not after.** During a call a seller
 * tries five things while quoting a client, and a price that only appears in
 * the history is a price they find out about too late. Until a real provider is
 * connected the panel says so outright rather than showing a made-up number as
 * if it were real — an invented figure is exactly the kind that ends up quoted
 * in a report.
 */
export function GenerationPanel({
  intent,
  onIntentChange,
  description,
  onDescriptionChange,
  strength,
  onStrengthChange,
  onGenerate,
  hasMask,
  isGenerating,
  isSimulated,
  disabled = false,
}: GenerationPanelProps) {
  const promptId = useId();
  const strengthId = useId();

  const canGenerate =
    !disabled && !isGenerating && hasMask && description.trim().length >= 3;

  return (
    <div className={styles.panel}>
      <PillTabs
        label="Qué cambiar con IA"
        selected={intent}
        onSelect={(key) => onIntentChange(key as GenerativeIntent)}
        options={[
          { key: "shape", label: "Forma" },
          { key: "texture", label: "Textura" },
        ]}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={promptId}>
          Qué quieres en esa zona
        </label>
        <textarea
          id={promptId}
          className={styles.prompt}
          rows={3}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={PROMPT_PLACEHOLDER[intent]}
          disabled={disabled || isGenerating}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.strengthHead}>
          <label className={styles.label} htmlFor={strengthId}>
            Intensidad
          </label>
          <span className={styles.strengthValue}>{strength.toFixed(2)}</span>
        </div>
        {/* The one parameter that separates adjusting from replacing, and the
            reason FLUX Fill [dev] was chosen over [pro] — [pro] does not expose
            it. The ends are labelled because a bare number from 0 to 1 says
            nothing about which way is which. */}
        <input
          id={strengthId}
          className={styles.strength}
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={strength}
          onChange={(event) => onStrengthChange(Number(event.target.value))}
          disabled={disabled || isGenerating}
        />
        <div className={styles.strengthEnds}>
          <span>Ajustar</span>
          <span>Reemplazar</span>
        </div>
      </div>

      <Button
        variant="primary"
        onClick={onGenerate}
        disabled={!canGenerate}
        title={
          hasMask
            ? undefined
            : "Pinta primero la zona de la prenda que quieres cambiar"
        }
      >
        {isGenerating ? "Generando…" : "Generar"}
      </Button>

      <p className={styles.cost}>
        {isSimulated ? (
          <>
            <span className={styles.simulated}>Simulado</span> — no se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          "El costo real de cada generación se registra en el diseño."
        )}
      </p>
    </div>
  );
}
