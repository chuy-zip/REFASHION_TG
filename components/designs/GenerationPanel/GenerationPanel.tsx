"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { PROMPT_PLACEHOLDER } from "@/lib/generation/prompt";
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

  const canGenerate =
    !disabled && !isGenerating && hasMask && description.trim().length >= 3;

  return (
    <div className={styles.panel}>
      <PillTabs
        label="Qué cambiar con IA"
        selected={intent}
        onSelect={(key) => onIntentChange(key as InpaintIntent)}
        options={[
          { key: "shape", label: "Forma" },
          { key: "texture", label: "Textura" },
          { key: "color", label: "Color" },
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

      {/* Always present and always the same two lines, so switching intent
          does not resize the panel. Only the words change. */}
      <p className={styles.note}>
        {intent === "color"
          ? "Este camino le pide el color a un modelo, y los modelos no respetan un código de color con exactitud. Para cambiar el color de verdad, usa el selector de arriba: ese es exacto."
          : "El color no se pide por aquí: el selector de arriba lo aplica exacto y sin costo."}
      </p>

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
