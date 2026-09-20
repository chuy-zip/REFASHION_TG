"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPost } from "@/lib/api-client";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import { TRY_ON_COST_USD } from "@/lib/generation/pricing";
import styles from "./TryOnPanel.module.css";

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

interface TryOnPanelProps {
  /**
   * Where the person comes from. `saved` picks a photo from the client's
   * catalog, `ai` describes one in words and has it generated first.
   */
  source: "saved" | "ai";
  designId: string;
  /** The client's model photos. Only read when `source` is `saved`. */
  models: AssetWithUrl[];
  /** What would be put on the person, already resolved by the caller. */
  garmentUrl: string | null;
  /** The same garment as an id, which is what the request actually carries. */
  garmentAssetId: string | null;
  /** True when that garment carries its logos. */
  hasLogos: boolean;
  /**
   * Why this design cannot be tried on at all, or null when it can.
   *
   * Present means the panel explains itself instead of offering a button that
   * would fail. See `PresentationTabs`.
   */
  blockedReason: string | null;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
}

/**
 * The two presentations of objetivo específico 3 that need a model.
 *
 * **What garment goes in, and why the caller decides.** `FASE_3_VTON` §6.3 left
 * this open and `FASE_1_5` §7 settled it: the try-on consumes the
 * **composition**, because that is what the client is buying. But a design with
 * no logo layers never produces a composition, and it is still a garment
 * somebody may want to see worn. So the rule generalises: the try-on takes the
 * design's current deliverable, which is the composition when there is one and
 * the clean garment when there is not. The presentation screen already resolved
 * exactly that for the "Plana" tab, so this panel is handed the answer instead
 * of recomputing a second opinion of it.
 *
 * The panel says which of the two it got, because it changes what the result
 * means: a try-on of a garment with no logos is a fit preview, not a proposal.
 *
 * **Why the logo warning is here.** The measurements showed generative steps
 * distort anything printed on a garment. A try-on deforms the cloth to fit a
 * body, so a flattened logo deforms with it. Measured against four garments,
 * the chosen model kept text, a large print and a fine embroidery legible
 * (`herramientas/docs/EXPERIMENTO_4_vton.md`) — but "measured to survive" is
 * not "guaranteed", and the screen should not discover the exception for the
 * user in a result.
 *
 * **Two columns, and everything that follows the choice lives in the right
 * one.** The garment and the model are the two halves of one request, so
 * choosing is a comparison and both have to be on screen at once. The warning,
 * the error and the button then belong under the models rather than under both
 * columns: they are consequences of the choice, and spanning the full width put
 * them below the garment, far from the hand that just picked somebody.
 */
export function TryOnPanel({
  source,
  designId,
  models,
  garmentUrl,
  garmentAssetId,
  hasLogos,
  blockedReason,
  isSimulated,
}: TryOnPanelProps) {
  const fieldId = useId();
  const router = useRouter();
  const { notify } = useToast();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null;

  if (blockedReason) {
    return (
      <EmptyState
        size="sm"
        title="Esta prenda ya está puesta"
        hint={blockedReason}
      />
    );
  }

  if (!garmentUrl || !garmentAssetId) {
    return (
      <EmptyState
        size="sm"
        title="Sin prenda todavía"
        hint="Elige una prenda base en la pantalla de edición para poder probarla sobre un modelo."
      />
    );
  }

  async function handleGenerate() {
    if (!garmentAssetId || !selectedModelId) return;

    setIsGenerating(true);
    setError(null);

    const result = await apiPost("/api/generate/vton", {
      design_id: designId,
      garment_asset_id: garmentAssetId,
      person_asset_id: selectedModelId,
    });

    setIsGenerating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    notify({
      type: "success",
      message: "Listo, la prueba virtual quedó en los productos finales.",
    });
    router.refresh();
  }

  return (
    <div className={styles.panel}>
      <div className={styles.columns}>
        {/* Left: what is going in. Shown and not merely described, because the
            one thing a user needs to check before spending is that the right
            garment is the one being sent. */}
        <div className={styles.column}>
          <figure className={styles.slot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
            <img
              className={styles.slotImage}
              src={garmentUrl}
              alt="La prenda que se va a probar"
              crossOrigin="anonymous"
            />
            <figcaption className={styles.slotCaption}>
              {hasLogos ? "Composición con logotipos" : "Prenda sin logotipos"}
            </figcaption>
          </figure>

          <p className={styles.columnHint}>
            {source === "saved"
              ? "Elige a la derecha sobre quién quieres verla."
              : "Describe a la derecha cómo es el modelo."}
          </p>
        </div>

        {/* Right: who wears it, and everything that follows from choosing. */}
        <div className={styles.column}>
          {source === "saved" ? (
            models.length === 0 ? (
              <p className={styles.hint}>
                Este cliente todavía no tiene fotos de modelo. Súbelas en su
                pestaña de Recursos para poder usarlas aquí.
              </p>
            ) : (
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <span className={styles.label} id={`${fieldId}-label`}>
                    Modelo
                  </span>
                  {/* The count, because the grid scrolls once the catalogue
                      grows and a scroller with no number never says how much
                      is below the fold. */}
                  <span className={styles.count}>{models.length}</span>
                </div>

                <div
                  className={styles.models}
                  role="group"
                  aria-labelledby={`${fieldId}-label`}
                >
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={styles.model}
                      aria-pressed={selectedModelId === model.id}
                      aria-label={assetDisplayName(model)}
                      disabled={isGenerating}
                      onClick={() =>
                        setSelectedModelId(
                          selectedModelId === model.id ? null : model.id
                        )
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
                      <img
                        className={styles.modelThumb}
                        src={model.url}
                        alt=""
                        crossOrigin="anonymous"
                      />
                    </button>
                  ))}
                </div>

                {selectedModel && (
                  <p className={styles.chosen}>
                    {assetDisplayName(selectedModel)}
                  </p>
                )}
              </div>
            )
          ) : (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${fieldId}-prompt`}>
                Cómo es el modelo
              </label>
              <textarea
                id={`${fieldId}-prompt`}
                className={styles.prompt}
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="mujer de pie, plano medio, fondo gris liso…"
              />
              <p className={styles.hint}>
                El modelo generado se guarda en el catálogo del cliente, así que
                puedes reutilizarlo en otros diseños sin volver a generarlo.
              </p>
            </div>
          )}

          {hasLogos && (
            <p className={styles.caution}>
              La prueba virtual deforma la tela para adaptarla al cuerpo, y el
              logotipo aplanado se deforma con ella. En las pruebas medidas el
              texto y los bordados se conservaron legibles, pero si el resultado
              no lo respeta, la alternativa es probar la prenda limpia y
              componer el logotipo después.
            </p>
          )}

          {error && <p className={styles.error}>{error}</p>}

          {source === "saved" ? (
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={isGenerating || !selectedModelId}
            >
              {isGenerating ? "Generando…" : "Generar prueba virtual"}
            </Button>
          ) : (
            <Button variant="primary" disabled>
              Generar modelo
            </Button>
          )}

          {source === "saved" && !selectedModelId && !isGenerating && (
            <p className={styles.blocked}>Elige un modelo para poder generar.</p>
          )}

          <p className={styles.status}>
            {source === "ai" ? (
              <>
                <span className={styles.pending}>Sin conectar</span>. Generar
                modelos todavía no llama a ningún servicio.
              </>
            ) : isSimulated ? (
              <>
                <span className={styles.pending}>Simulado</span>. No se llama a
                ningún servicio y no se cobra nada.
              </>
            ) : (
              /* The price BEFORE the button, which is the half the app owed: it
                 was being recorded after the fact, and a seller trying five
                 things during a call found out too late. It is not an estimate
                 — it is what the chosen model charged on every measured call,
                 and it does not vary with image size. */
              <>
                Cuesta unos <strong>{money.format(TRY_ON_COST_USD)}</strong> por
                prueba. El costo real se registra en el diseño.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
