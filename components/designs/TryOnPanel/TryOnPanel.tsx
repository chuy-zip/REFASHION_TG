"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import styles from "./TryOnPanel.module.css";

interface TryOnPanelProps {
  /**
   * Where the person comes from. `saved` picks a photo from the client's
   * catalog, `ai` describes one in words and has it generated first.
   */
  source: "saved" | "ai";
  /** The client's model photos. Only read when `source` is `saved`. */
  models: AssetWithUrl[];
  /** What would be put on the person, already resolved by the caller. */
  garmentUrl: string | null;
  /** True when that garment carries its logos. */
  hasLogos: boolean;
}

/**
 * The two presentations of objetivo específico 3 that need a model.
 *
 * **A mockup, deliberately.** Nothing here calls a service and the buttons say
 * so. It exists now because `FASE_3_VTON` §6.1 found that the module brings no
 * new screens — it fills two tabs that were already laid out — so the useful
 * thing to settle first is what the screen ASKS FOR, not what answers it.
 *
 * **What garment goes in, and why the caller decides.** §6.3 left this open and
 * `FASE_1_5` §7 settled it: the try-on consumes the **composition**, because
 * that is what the client is buying. But a design with no logo layers never
 * produces a composition, and it is still a garment somebody may want to see
 * worn. So the rule generalises: the try-on takes the design's current
 * deliverable, which is the composition when there is one and the clean garment
 * when there is not. The presentation screen already resolved exactly that for
 * the "Plana" tab, so this panel is handed the answer instead of recomputing a
 * second opinion of it.
 *
 * The panel says which of the two it got, because it changes what the result
 * means: a try-on of a garment with no logos is a fit preview, not a proposal.
 *
 * **Why the logo warning is here.** The measurements in `herramientas/` showed
 * generative steps distort anything printed on a garment. A try-on deforms the
 * cloth to fit a body, so a flattened logo deforms with it. That is the known
 * risk `FASE_3_VTON` §3 makes the selection criterion, and the screen should
 * not discover it for the user in a result.
 */
export function TryOnPanel({
  source,
  models,
  garmentUrl,
  hasLogos,
}: TryOnPanelProps) {
  const fieldId = useId();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null;

  if (!garmentUrl) {
    return (
      <EmptyState
        size="sm"
        title="Sin prenda todavía"
        hint="Elige una prenda base en la pantalla de edición para poder probarla sobre un modelo."
      />
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.inputs}>
        {/* Shown and not merely described: the two halves of the request are
            an image and a person, and the one thing a user needs to check
            before spending is that the right garment is going in. */}
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

        <span className={styles.plus} aria-hidden="true">
          +
        </span>

        <figure className={styles.slot}>
          {source === "saved" && selectedModel ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
              <img
                className={styles.slotImage}
                src={selectedModel.url}
                alt={assetDisplayName(selectedModel)}
                crossOrigin="anonymous"
              />
              <figcaption className={styles.slotCaption}>
                {assetDisplayName(selectedModel)}
              </figcaption>
            </>
          ) : (
            <div className={styles.slotEmpty}>
              <p className={styles.slotEmptyText}>
                {source === "saved"
                  ? "Elige un modelo"
                  : "Describe el modelo"}
              </p>
            </div>
          )}
        </figure>
      </div>

      {source === "saved" ? (
        models.length === 0 ? (
          <p className={styles.hint}>
            Este cliente todavía no tiene fotos de modelo. Súbelas en su
            pestaña de Recursos para poder usarlas aquí.
          </p>
        ) : (
          <div className={styles.field}>
            <span className={styles.label} id={`${fieldId}-label`}>
              Modelo
            </span>
            <div className={styles.models} role="group" aria-labelledby={`${fieldId}-label`}>
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={styles.model}
                  aria-pressed={selectedModelId === model.id}
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
                    alt={assetDisplayName(model)}
                    crossOrigin="anonymous"
                  />
                </button>
              ))}
            </div>
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
          logotipo aplanado se deforma con ella. Si el resultado no lo respeta,
          la alternativa es probar la prenda limpia y componer el logotipo
          después.
        </p>
      )}

      <Button variant="primary" disabled>
        {source === "saved" ? "Generar prueba virtual" : "Generar modelo"}
      </Button>

      <p className={styles.status}>
        <span className={styles.pending}>Sin conectar</span>. Esta pantalla
        todavía no llama a ningún servicio.
      </p>
    </div>
  );
}
