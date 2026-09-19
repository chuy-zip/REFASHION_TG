"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { PromptSuggestions } from "@/components/designs/PromptSuggestions/PromptSuggestions";
import { INTENT_COPY, PROMPT_PLACEHOLDER } from "@/lib/generation/prompt";
import type { InpaintIntent } from "@/lib/generation/types";
import styles from "./GenerationPanel.module.css";

interface GenerationPanelProps {
  intent: InpaintIntent;
  onIntentChange: (intent: InpaintIntent) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  onGenerate: () => void;
  hasMask: boolean;
  isGenerating: boolean;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
  disabled?: boolean;
}

/**
 * The generative half of Módulo 2: what the colour picker cannot do — plus the
 * one thing it can, offered on purpose.
 *
 * Shape and texture are here because nothing else does them. **Colour is here
 * to be measured against the exact path**, not to compete with it: the claim
 * that diffusion models do not honour a colour code reliably is the reason the
 * deterministic recolour exists (`FASE_2_INPAINTING` §2.3), and a claim this
 * project rests on has to be something it can demonstrate rather than cite. The
 * panel says outright that the other path is exact, so nobody reaches for this
 * one by accident.
 *
 * **There used to be an "Intensidad" slider here, and removing it was the
 * point.** It set `strength`, which this project measured that FLUX Fill does
 * not use: the model's own documentation says so, and Runware translates the
 * value into a step count instead. So the control silently cut the compute
 * while its label promised something else, and a knob that lies is worse than
 * no knob. Step count is fixed at what every measured run used.
 * See `herramientas/docs/EXPERIMENTO_1_color_generativo.md`.
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
  onGenerate,
  hasMask,
  isGenerating,
  isSimulated,
  disabled = false,
}: GenerationPanelProps) {
  const promptId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const canGenerate =
    !disabled && !isGenerating && hasMask && description.trim().length >= 3;

  return (
    <div className={styles.panel}>
      <PillTabs
        label="Qué cambiar con IA"
        selected={intent}
        onSelect={(key) => onIntentChange(key as InpaintIntent)}
        // "Limpiar" first because it is the one with evidence behind it, and
        // "Color" is gone: the project measured that this model does not honour
        // an exact colour, and the picker above does.
        options={[
          { key: "clean", label: "Limpiar" },
          { key: "shape", label: "Forma" },
          { key: "texture", label: "Textura" },
        ]}
      />

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label className={styles.label} htmlFor={promptId}>
            Qué quieres en esa zona
          </label>
          {/* Beside the box and not hidden in a menu: the wording is the
              single biggest lever on the result, and the examples are how
              anyone learns how long and how specific a good one is. */}
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
          id={promptId}
          className={styles.prompt}
          rows={3}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={PROMPT_PLACEHOLDER[intent]}
          disabled={disabled || isGenerating}
        />
      </div>

      {/* What this intent is for, in the panel rather than only in the
          suggestions dialog: it is the difference between three tabs and three
          tabs someone can choose between. */}
      <p className={styles.note}>{INTENT_COPY[intent].hint}</p>

      <PromptSuggestions
        intent={intent}
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onUse={onDescriptionChange}
      />

      {/* Visible, not a tooltip on the disabled button. That is what it was,
          and a disabled control does not reliably fire hover in every browser
          and never does on touch — so the only explanation for a dead button
          was one most people could not reach. */}
      {!hasMask && (
        <p className={styles.blocked} role="status">
          Pinta primero la zona de la prenda que quieres cambiar.
        </p>
      )}

      <Button variant="primary" onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating ? "Generando…" : "Generar"}
      </Button>

      <p className={styles.cost}>
        {isSimulated ? (
          <>
            <span className={styles.simulated}>Simulado</span>. No se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          "El costo real de cada generación se registra en el diseño."
        )}
      </p>
    </div>
  );
}
