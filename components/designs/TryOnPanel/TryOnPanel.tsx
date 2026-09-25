"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { WorkingOverlay } from "@/components/ui/WorkingOverlay/WorkingOverlay";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPost } from "@/lib/api-client";
import { ModelGenerator } from "@/components/designs/ModelGenerator/ModelGenerator";
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
  /** Where the result ends up, so the panel can point at it afterwards. */
  clientId: string;
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
 * **The screen is the request, drawn.** Garment, plus, person: the two halves
 * and the operation between them. The person starts as an empty slot you press,
 * and choosing fills it, so the page always shows what is about to be sent
 * rather than describing it. An earlier version listed the models in a column
 * beside the garment, which showed the catalogue instead of the request.
 *
 * **And it shows the result.** Generating used to leave the screen exactly as
 * it was — the try-on is stored as a final product, not as a step of this
 * design, so nothing here changed and the only evidence was a toast. Now the
 * result takes the stage, with the way to where it was filed.
 *
 * **Why the logo warning is here.** A try-on deforms the cloth to fit a body,
 * so a flattened logo deforms with it. Measured against four garments the
 * chosen model kept text, a large print and a fine embroidery legible
 * (`herramientas/docs/EXPERIMENTO_4_vton.md`), but measured to survive is not
 * guaranteed, and the screen should not discover the exception for the user in
 * a result.
 */
export function TryOnPanel({
  source,
  designId,
  clientId,
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
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * El modelo que se acaba de generar en esta pantalla.
   *
   * `models` viene del servidor y no lo incluye hasta que la página se
   * recargue, así que sin esto alguien genera un modelo y la prueba
   * virtual no encuentra a quién vestir.
   */
  const [generatedModel, setGeneratedModel] = useState<AssetWithUrl | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  /**
   * True mientras el generador de modelos trabaja.
   *
   * Vive acá y no adentro del generador porque lo que hay que mostrar está
   * acá: el casillero de la persona, que es lo que se está llenando.
   */
  const [isDrawingModel, setIsDrawingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const disponibles = generatedModel ? [...models, generatedModel] : models;
  const selectedModel =
    disponibles.find((model) => model.id === selectedModelId) ?? null;

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

    const result = await apiPost<{ url: string }>("/api/generate/vton", {
      design_id: designId,
      garment_asset_id: garmentAssetId,
      person_asset_id: selectedModelId,
    });

    setIsGenerating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setResultUrl(result.data.url);
    notify({
      type: "success",
      message: "Listo, la prueba virtual quedó en los productos finales.",
    });
    // The result does not belong to this screen — it is a final product — but
    // the design's status may have moved out of draft, and the hub reads that.
    router.refresh();
  }

  // **The result takes over the stage**, because it is what the person asked
  // for and because nothing else on this screen would have changed to show it.
  if (resultUrl) {
    return (
      <div className={styles.panel}>
        <figure className={styles.result}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
          <img
            className={styles.resultImage}
            src={resultUrl}
            alt="La prenda puesta sobre el modelo"
            crossOrigin="anonymous"
          />
          <figcaption className={styles.slotCaption}>
            Guardada en los productos finales del cliente.
          </figcaption>
        </figure>

        <div className={styles.resultActions}>
          <Link
            className={styles.resultLink}
            href={`/clients/${clientId}?tab=products`}
          >
            Ver en productos finales
          </Link>
          <Button
            variant="secondary"
            onClick={() => {
              setResultUrl(null);
              setSelectedModelId(null);
            }}
          >
            Probar con otro modelo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {/* The request, drawn: what goes in, the operation, and who wears it. */}
      <div className={styles.composition}>
        {/* Sobre la imagen y no solo en el botón apagado, igual que en la
            pantalla de edición: la prueba tarda y el trabajo se le hace a
            esto, así que es acá donde se tiene que ver. */}
        {isGenerating && <WorkingOverlay label="Generando la prueba…" />}

        <figure className={styles.slot}>
          <div className={styles.slotFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
            <img
              className={styles.slotImage}
              src={garmentUrl}
              alt="La prenda que se va a probar"
              crossOrigin="anonymous"
            />
          </div>
          <figcaption className={styles.slotCaption}>
            {hasLogos ? "Composición con logotipos" : "Prenda sin logotipos"}
          </figcaption>
        </figure>

        <span className={styles.plus} aria-hidden="true">
          +
        </span>

        <figure className={styles.slot}>
          {/* The person that is going to be sent, whichever way she was
              chosen. This used to be `source === "saved" && selectedModel`, so
              a model drawn on this very screen left the slot reading "Describe
              el modelo" while its photo sat somewhere else on the page. */}
          {selectedModel ? (
            <>
              <div className={styles.slotFrame}>
                {isDrawingModel && (
                  <WorkingOverlay label="Dibujando al modelo…" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
                <img
                  className={styles.slotImage}
                  src={selectedModel.url}
                  alt={assetDisplayName(selectedModel)}
                  crossOrigin="anonymous"
                />
              </div>
              <figcaption className={styles.slotCaption}>
                {assetDisplayName(selectedModel)}
                {source === "saved" && disponibles.length > 1 && (
                  <button
                    type="button"
                    className={styles.change}
                    onClick={() => setPickerOpen(true)}
                    disabled={isGenerating}
                  >
                    Cambiar
                  </button>
                )}
              </figcaption>
            </>
          ) : source === "saved" ? (
            /* Dashed and pressable: it is a slot waiting to be filled, and the
               same provisional language the rest of the app uses. */
            <button
              type="button"
              className={styles.slotEmpty}
              onClick={() => setPickerOpen(true)}
              disabled={isGenerating || disponibles.length === 0}
            >
              <span className={styles.slotEmptyText}>
                {disponibles.length === 0
                  ? "Sin fotos de modelo"
                  : "Elige un modelo"}
              </span>
            </button>
          ) : (
            <div className={styles.slotFrame}>
              {isDrawingModel && <WorkingOverlay label="Dibujando al modelo…" />}
              <div className={styles.slotEmpty}>
                <span className={styles.slotEmptyText}>Describe el modelo</span>
              </div>
            </div>
          )}
        </figure>
      </div>

      {source === "saved" ? (
        disponibles.length === 0 && (
          <p className={styles.hint}>
            Este cliente todavía no tiene fotos de modelo. Súbelas en su pestaña
            de Recursos para poder usarlas aquí.
          </p>
        )
      ) : (
        /* **Generar acá deja el modelo elegido acá.** Uno que se crea desde la
           prueba virtual y después hay que ir a buscar a otra pestaña sería
           pedirle al usuario que recuerde un nombre que todavía no tiene. Se
           guarda igual en el catálogo del cliente, que es lo que lo vuelve
           reutilizable en los demás diseños. */
        <ModelGenerator
          clientId={clientId}
          isSimulated={isSimulated}
          embedded
          busy={isGenerating}
          onBusyChange={setIsDrawingModel}
          onGenerated={(asset) => {
            setGeneratedModel(asset);
            setSelectedModelId(asset.id);
          }}
        />
      )}

      {hasLogos && (
        <p className={styles.caution}>
          La prueba virtual deforma la tela para adaptarla al cuerpo, y el
          logotipo aplanado se deforma con ella.
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* One button, both sources. The "ai" tab used to end in a disabled
          placeholder left over from before models could be generated, which
          meant that tab could never run a try-on: the person was drawn and
          saved, and the request she was drawn for had no way to be sent. */}
      <Button
        variant="primary"
        onClick={handleGenerate}
        disabled={isGenerating || isDrawingModel || !selectedModelId}
      >
        {isGenerating ? "Generando…" : "Generar prueba virtual"}
      </Button>

      <p className={styles.status}>
        {isSimulated ? (
          <>
            <span className={styles.pending}>Simulado</span>. No se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          /* The price BEFORE the button, which is the half the app owed: it was
             being recorded after the fact, and a seller trying five things
             during a call found out too late. Not an estimate — it is what the
             chosen model charged on every measured call, and it does not vary
             with image size. */
          <>
            Cuesta unos <strong>{money.format(TRY_ON_COST_USD)}</strong> por
            prueba. El costo real se registra en el diseño.
          </>
        )}
      </p>

      {/* The catalogue lives in a dialog rather than beside the garment: the
          page is about one request, and a grid of every model the client has is
          a different question that only matters while it is being answered. It
          is also where a growing catalogue has room to scroll. */}
      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        labelledBy={`${fieldId}-picker`}
      >
        <div className={styles.picker}>
          <div className={styles.pickerHead}>
            <h2 className={styles.pickerTitle} id={`${fieldId}-picker`}>
              Elige un modelo
            </h2>
            <span className={styles.count}>{disponibles.length}</span>
          </div>

          <div className={styles.models} role="group">
            {disponibles.map((model) => (
              <button
                key={model.id}
                type="button"
                className={styles.model}
                aria-pressed={selectedModelId === model.id}
                onClick={() => {
                  setSelectedModelId(model.id);
                  setPickerOpen(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
                <img
                  className={styles.modelThumb}
                  src={model.url}
                  alt=""
                  crossOrigin="anonymous"
                />
                <span className={styles.modelName}>
                  {assetDisplayName(model)}
                </span>
              </button>
            ))}
          </div>

          {/* Elegir cierra, pero cambiar de opinión también tiene que poder:
              el `<dialog>` nativo solo responde a Esc. */}
          <div className={styles.pickerActions}>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
