"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { WORK_STEP_COPY } from "@/lib/designs";
import type { WorkStep } from "@/components/designs/StepStrip/StepStrip";
import styles from "./StepDetails.module.css";

const fecha = new Intl.DateTimeFormat("es-GT", {
  dateStyle: "long",
  timeStyle: "short",
});

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

interface StepDetailsProps {
  /** The step being looked at, or null while the dialog is closed. */
  step: WorkStep | null;
  /** Every step, so this one can name the image it came out of. */
  steps: WorkStep[];
  open: boolean;
  onClose: () => void;
}

function pesoLegible(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Todo lo que una imagen sabe de sí misma.
 *
 * **Existe porque había datos que nadie podía ver.** La migración 018 guardaba
 * semilla, modelo y pasos desde el 20 de septiembre, y la 020 agregó `strength`
 * y la latencia; ninguna pantalla los leía, y el tipo `Asset` de TypeScript ni
 * siquiera los declaraba. Una columna que ninguna pantalla muestra es una
 * columna que nadie revisa, y un dato que nadie revisa se pudre sin ruido.
 *
 * **No todos los pasos tienen prompt, y eso se dice en palabras.** Una prenda
 * pintada a mano y una prenda base subida no salieron de ningún modelo. Antes
 * que mostrar campos vacíos o guiones, el diálogo explica en una línea por qué
 * no hay más, que es la diferencia entre "no aplica" y "falta el dato".
 *
 * **El prompt se puede copiar**, porque el uso real de mirar un paso viejo es
 * querer repetir lo que se pidió ahí.
 */
export function StepDetails({ step, steps, open, onClose }: StepDetailsProps) {
  const titleId = useId();
  /**
   * De QUÉ paso se copió el prompt, no si se copió.
   *
   * Guardar el id en vez de un booleano hace que el aviso desaparezca solo al
   * cambiar de paso, sin un efecto que reponga el estado: resetear estado
   * dentro de un efecto provoca un render de más y es lo que marca el linter.
   */
  const [copiadoDe, setCopiadoDe] = useState<string | null>(null);

  // El aviso se borra solo. El setState vive dentro del temporizador y no en
  // el cuerpo del efecto, que es la diferencia entre programar algo y
  // reponerlo en cada render.
  useEffect(() => {
    if (!copiadoDe) return;
    const plazo = setTimeout(() => setCopiadoDe(null), 2500);
    return () => clearTimeout(plazo);
  }, [copiadoDe]);

  if (!step) return null;

  const paso = step;
  const copy = WORK_STEP_COPY[step.kind];
  const generacion = step.generation;
  const origen = generacion?.parentId
    ? steps.find((otro) => otro.id === generacion.parentId) ?? null
    : null;
  const peso = pesoLegible(step.bytes);

  async function copiarPrompt() {
    if (!generacion?.prompt) return;
    try {
      await navigator.clipboard.writeText(generacion.prompt);
      setCopiadoDe(paso.id);
    } catch {
      // Sin portapapeles el texto sigue seleccionable a mano, que es la razón
      // por la que el prompt se muestra entero y no recortado.
      setCopiadoDe(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {copy.label}
          </h2>
          <span className={styles.when}>
            {fecha.format(new Date(step.createdAt))}
          </span>
        </div>

        {step.url && (
          /* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */
          <img
            className={styles.image}
            src={step.url}
            alt={`Paso: ${copy.label}`}
            // Las medidas reales, que la fila ya conoce. El CSS decide cuánto
            // ocupa; estos atributos solo le dan la proporción al navegador
            // para que reserve el hueco y el diálogo no salte cuando la imagen
            // termina de cargar.
            width={step.width ?? undefined}
            height={step.height ?? undefined}
            crossOrigin="anonymous"
          />
        )}

        <dl className={styles.data}>
          {step.width && step.height && (
            <div className={styles.pair}>
              <dt className={styles.key}>Tamaño</dt>
              <dd className={styles.value}>
                {step.width} × {step.height} px
              </dd>
            </div>
          )}
          {peso && (
            <div className={styles.pair}>
              <dt className={styles.key}>Peso</dt>
              <dd className={styles.value}>{peso}</dd>
            </div>
          )}
          <div className={styles.pair}>
            <dt className={styles.key}>Origen</dt>
            <dd className={styles.value}>
              {step.origin === "upload"
                ? "Subida"
                : step.origin === "derived"
                  ? "Derivada en el navegador"
                  : "Generada por un modelo"}
            </dd>
          </div>
          {step.costUsd !== null && (
            <div className={styles.pair}>
              <dt className={styles.key}>Costo</dt>
              <dd className={styles.value}>{money.format(step.costUsd)}</dd>
            </div>
          )}
          {generacion?.latencyMs && (
            <div className={styles.pair}>
              <dt className={styles.key}>Tardó</dt>
              <dd className={styles.value}>
                {(generacion.latencyMs / 1000).toFixed(1)} s
              </dd>
            </div>
          )}
        </dl>

        {generacion ? (
          <>
            {generacion.prompt && (
              <section className={styles.promptBlock}>
                <div className={styles.promptHead}>
                  <h3 className={styles.subtitle}>Lo que se le pidió</h3>
                  <button
                    type="button"
                    className={styles.copy}
                    onClick={copiarPrompt}
                  >
                    Copiar
                  </button>
                </div>
                {/* El texto exacto que salió hacia el proveedor, no el fragmento
                    que se tecleó: es lo que hace reproducible una fila meses
                    después. */}
                <p className={styles.prompt}>{generacion.prompt}</p>
                <span className={styles.copiado} role="status" aria-live="polite">
                  {copiadoDe === paso.id ? "Prompt copiado." : ""}
                </span>
              </section>
            )}

            {/* Plegado y no borrado: el modelo, la semilla y los pasos son lo
                que hace reproducible una fila, así que tienen que estar. Pero
                se miran una vez cada tanto, y desplegados empujaban el costo y
                el prompt fuera de la pantalla. `<details>` nativo: abre con
                teclado y no necesita estado. */}
            <details className={styles.avanzado}>
              <summary className={styles.avanzadoTitulo}>
                Información avanzada
              </summary>
              <dl className={styles.data}>
                {generacion.model && (
                <div className={styles.pair}>
                  <dt className={styles.key}>Modelo</dt>
                  <dd className={`${styles.value} ${styles.mono}`}>
                    {generacion.model}
                  </dd>
                </div>
              )}
              {generacion.seed !== null && (
                <div className={styles.pair}>
                  <dt className={styles.key}>Semilla</dt>
                  <dd className={`${styles.value} ${styles.mono}`}>
                    {generacion.seed}
                  </dd>
                </div>
              )}
              {generacion.steps !== null && (
                <div className={styles.pair}>
                  <dt className={styles.key}>Pasos</dt>
                  <dd className={styles.value}>{generacion.steps}</dd>
                </div>
              )}
              {generacion.strength !== null && (
                <div className={styles.pair}>
                  <dt className={styles.key}>Intensidad</dt>
                  <dd className={styles.value}>
                    {generacion.strength.toFixed(2)}
                  </dd>
                </div>
              )}
              {origen && (
                <div className={styles.pair}>
                  <dt className={styles.key}>Salió de</dt>
                  <dd className={styles.value}>
                    {WORK_STEP_COPY[origen.kind].label}
                    {" · "}
                    {fecha.format(new Date(origen.createdAt))}
                  </dd>
                </div>
              )}
                {generacion.maskId && (
                  <div className={styles.pair}>
                    <dt className={styles.key}>Zona</dt>
                    <dd className={styles.value}>
                      Se pintó una máscara para esta generación
                    </dd>
                  </div>
                )}
              </dl>
            </details>
          </>
        ) : (
          /* Dice por qué no hay más, en vez de mostrar campos vacíos. */
          <p className={styles.sinModelo}>
            {step.kind === "origin"
              ? "Es la prenda base del catálogo: no salió de un modelo, así que no tiene prompt ni costo."
              : "Este paso lo hiciste en el navegador. No pasó por ningún modelo, así que no tiene prompt ni costo."}
          </p>
        )}

        {/* Cerrar explícito. El `<dialog>` nativo sale con Esc y con nada más:
            no reacciona al clic en el fondo, así que sin este botón la única
            salida es una tecla que no está escrita en ningún lado. Mismo
            patrón que el diálogo de recursos. */}
        <div className={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
