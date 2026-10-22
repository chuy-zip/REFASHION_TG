"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PromptSuggestions } from "@/components/designs/PromptSuggestions/PromptSuggestions";
import { apiPost } from "@/lib/api-client";
import type { AssetWithUrl } from "@/lib/assets";
import { MODEL_COST_USD } from "@/lib/generation/pricing";
import {
  MODEL_PLACEHOLDER,
  MODEL_SUGGESTIONS,
} from "@/lib/generation/prompt";
import styles from "./ModelGenerator.module.css";

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

interface ModelGeneratorProps {
  clientId: string;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
  /** Runs with the model that was just saved to the client's catalogue. */
  onGenerated?: (asset: AssetWithUrl) => void;
  /**
   * True when this lives inside another panel that already shows the result and
   * owns the screen's main action.
   *
   * One flag rather than three, because the three go together: the try-on panel
   * puts the photo straight into the request it is composing, so a second copy
   * here would read as two different people; and its own button has to stop
   * competing with the one that actually sends the request.
   */
  embedded?: boolean;
  /**
   * True while the caller is doing something that this must not interrupt.
   *
   * Generating a model in the middle of a try-on is two charges at once and a
   * person swapped halfway through a request that already left.
   */
  busy?: boolean;
  /** Reports the other direction: this is generating, do not send anything. */
  onBusyChange?: (busy: boolean) => void;
  /**
   * True for a read-only member of the client. The panel stays usable to look
   * at, type into and open the suggestions; only the button that charges is
   * off, with the reason said next to it. The route refuses it anyway.
   */
  readOnly?: boolean;
}

/**
 * Describe a person, get a model photo, keep it in the catalogue.
 *
 * **One component, two places.** The same panel is offered from the client's
 * catalogue, where model photos live, and from the try-on screen, where one is
 * needed right now. It is the same act either way, and two copies of it would
 * be two places for the wording and the price to drift apart.
 *
 * **What it produces is a catalogue asset, not a design's.** A drawn person is
 * reused across every design of that client, so it is paid once and picked many
 * times. That is also why the panel says where it went: someone who generates a
 * model from inside a try-on has no reason to guess that it will still be there
 * tomorrow.
 *
 * **The suggestions carry the whole prompt, visibly.** Same rule as the other
 * two generative paths: what is in the box is what is sent, with no frame added
 * behind it. The suggestions are long because the conditions that make a model
 * photo usable — a plain light background, a frontal view, plain close-fitting
 * clothes — have to be asked for, and they are the wording that was measured to
 * produce them.
 */
export function ModelGenerator({
  clientId,
  isSimulated,
  onGenerated,
  embedded = false,
  busy = false,
  onBusyChange,
  readOnly = false,
}: ModelGeneratorProps) {
  const fieldId = useId();
  const [description, setDescription] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssetWithUrl | null>(null);

  // Bloqueado es bloqueado, venga de acá o de afuera: la caja de texto y las
  // sugerencias se apagan igual que el botón, porque escribir mientras algo
  // está en vuelo invita a apretar apenas termine con lo otro a medias.
  const locked = isGenerating || busy;
  const canGenerate =
    !readOnly && !locked && description.trim().length >= 20;

  async function handleGenerate() {
    setIsGenerating(true);
    onBusyChange?.(true);
    setError(null);

    const response = await apiPost<AssetWithUrl>("/api/generate/model", {
      client_id: clientId,
      description,
    });

    setIsGenerating(false);
    onBusyChange?.(false);

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setResult(response.data);
    onGenerated?.(response.data);
  }

  return (
    <div
      className={embedded ? `${styles.panel} ${styles.framed}` : styles.panel}
    >
      {embedded && <h3 className={styles.frameTitle}>Primero, el modelo</h3>}

      {!embedded && result && (
        <figure className={styles.result}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
          <img
            className={styles.resultImage}
            src={result.url}
            alt="El modelo que acabas de generar"
            crossOrigin="anonymous"
          />
          <figcaption className={styles.resultNote}>
            Guardado en los recursos del cliente. Puedes usarlo en otros diseños
            sin volver a generarlo.
          </figcaption>
        </figure>
      )}

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label className={styles.label} htmlFor={fieldId}>
            Cómo es el modelo
          </label>
          <button
            type="button"
            className={styles.suggest}
            onClick={() => setSuggestionsOpen(true)}
            disabled={locked}
          >
            Sugerencias
          </button>
        </div>
        <textarea
          id={fieldId}
          className={styles.prompt}
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={MODEL_PLACEHOLDER}
          disabled={locked}
        />
        <p className={styles.hint}>
          Describe a la persona y cómo está la foto: el encuadre, el fondo y la
          ropa. Cuanto más completo, más se parece a lo que pediste.
        </p>
      </div>

      <PromptSuggestions
        title="Sugerencias para describir un modelo"
        hint="Una foto de modelo sirve cuando tiene fondo liso y claro, la persona de frente y ropa lisa y ajustada. Los ejemplos piden las tres cosas; puedes cambiar a la persona y dejar el resto."
        examples={MODEL_SUGGESTIONS}
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onUse={setDescription}
      />

      {error && <p className={styles.error}>{error}</p>}

      <Button
        variant={embedded && result ? "secondary" : "primary"}
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {isGenerating
          ? "Generando…"
          : result
            ? "Generar otro modelo"
            : "Generar modelo"}
      </Button>

      {readOnly && (
        <p className={styles.blocked}>
          Tu acceso a este cliente es de solo lectura: puedes explorar, pero no
          generar modelos.
        </p>
      )}

      {!readOnly && !locked && description.trim().length < 20 && (
        <p className={styles.blocked}>
          Describe al modelo con un poco más de detalle.
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
            Cuesta unos <strong>{money.format(MODEL_COST_USD)}</strong>. Se paga
            una vez: el modelo queda en los recursos del cliente.
          </>
        )}
      </p>
    </div>
  );
}
