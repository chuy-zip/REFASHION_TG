"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Thumbnail } from "@/components/ui/Thumbnail/Thumbnail";
import { StepDetails } from "@/components/designs/StepDetails/StepDetails";
import { WORK_STEP_COPY, type WorkStepKind } from "@/lib/designs";
import type { AssetOrigin } from "@/lib/types";
import styles from "./StepStrip.module.css";

const stepTime = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** One image the design passed through, on its way to where it is now. */
export interface WorkStep {
  id: string;
  url: string | null;
  createdAt: string;
  /** Null for anything that did not go through a paid model. */
  costUsd: number | null;
  /**
   * Which of the four things this was, decided in `lib/designs.ts` from both
   * `asset_type` and `origin`. Not computed here: the type alone cannot tell a
   * free brush stroke from a paid generation, because both are `inpainting`.
   */
  kind: WorkStepKind;
  /** Null on rows created before migration 016 added the columns. */
  width: number | null;
  height: number | null;
  /** Null on rows created before migration 008. */
  bytes: number | null;
  origin: AssetOrigin;
  /**
   * Lo que hace falta para entender de dónde salió esta imagen, o null cuando
   * no salió de ningún modelo.
   *
   * Null y no un objeto con todo en null a propósito: una prenda pintada a
   * mano **no tiene** prompt, y eso es distinto de tenerlo vacío. El diálogo
   * usa esa diferencia para explicarlo en palabras en vez de mostrar guiones.
   */
  generation: {
    prompt: string | null;
    model: string | null;
    seed: number | null;
    steps: number | null;
    strength: number | null;
    latencyMs: number | null;
    parentId: string | null;
    maskId: string | null;
  } | null;
}

interface StepStripProps {
  steps: WorkStep[];
  /** Where the design is standing: `designs.current_asset_id`. */
  currentId: string | null;
  /** Which step the user is looking at, which is not where they are standing. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onResume: (id: string) => void;
  isResuming: boolean;
  canEdit: boolean;
}

/**
 * The strip of steps, with the cursor.
 *
 * **A tree inside, a line outside.** `assets.parent_asset_id` makes the stored
 * history a tree — going back and generating again leaves two branches on the
 * same parent — but nobody navigates a tree. Here everything sits in the order
 * it was created and **nothing ever moves**: the only thing that travels is the
 * marker saying where the user is standing. Reordering the strip on selection
 * was considered and dropped, because a list that rearranges itself destroys
 * the spatial memory of the person using it (`FASE_1_5` §7.4).
 *
 * **Previewing is not resuming.** A click looks; moving the cursor is a
 * separate, explicit act. If one gesture did both, the user would change the
 * design's state every time they wanted to compare two of them.
 *
 * **Going back is free**, and the strip says so. Every step already exists in
 * R2 and in the database, so returning is one column update — no second call,
 * no second charge. That is the whole argument for keeping the history on the
 * server instead of in the browser.
 *
 * This is the **control** version of the strip. The **record** version, which
 * only opens a step to look at it, lives on the design hub and shows finished
 * compositions instead of these.
 */
export function StepStrip({
  steps,
  currentId,
  selectedId,
  onSelect,
  onResume,
  isResuming,
  canEdit,
}: StepStripProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  /**
   * Plegada o no. Se recuerda solo mientras dura la pantalla, a propósito.
   *
   * En un monitor grande la tira y el lienzo conviven bien; en un portátil la
   * tira se come la mitad del alto y lo que se está editando queda chico. Pero
   * cuál de las dos cosas hace falta cambia a cada rato dentro de la misma
   * sesión, así que esto es un control a mano y no una preferencia guardada.
   */
  const [plegada, setPlegada] = useState(false);

  if (steps.length === 0) return null;

  const spent = steps.reduce((total, step) => total + (step.costUsd ?? 0), 0);
  const selected = steps.find((step) => step.id === selectedId) ?? null;
  const canResume = canEdit && selected !== null && selected.id !== currentId;

  // What is on the canvas: the step being previewed, or the one the design is
  // standing on when nothing is. Falling back rather than blanking, because an
  // empty slot invites reading it as "this image has no size".
  const shown =
    selected ?? steps.find((step) => step.id === currentId) ?? null;

  return (
    <section className={styles.strip} aria-label="Pasos del diseño">
      <div className={styles.head}>
        <span className={styles.label}>Pasos</span>
        <span className={styles.count}>{steps.length}</span>

        <div className={styles.spacer} />

        {/* Antes de los números: lo primero que alguien busca cuando la
            pantalla le queda chica es cómo achicar esto. */}
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setPlegada((antes) => !antes)}
          aria-expanded={!plegada}
        >
          {plegada ? "Mostrar pasos" : "Ocultar pasos"}
        </button>

        {/* The size of the image being looked at, in the strip rather than on
            the canvas: every model in this project takes the source dimensions
            as an input, and two steps of a design do not always share them —
            the instruction model reframes. Someone comparing two steps needs to
            see that without opening a file. */}
        {shown?.width && shown.height && (
          <>
            <span className={styles.spentLabel}>Tamaño</span>
            <span className={styles.count}>
              {shown.width} × {shown.height}
            </span>
          </>
        )}

        {/* The running cost of the design, where it is looked at anyway. It is
            the protocol's argument for small businesses, visible without
            building a screen for it. */}
        {spent > 0 && (
          <>
            <span className={styles.spentLabel}>Gastado</span>
            <span className={styles.spent}>{money.format(spent)}</span>
          </>
        )}
      </div>

      {/* La cabecera se queda siempre: el tamaño de lo que se está mirando y
          lo gastado son datos que no ocupan alto y que alguien consulta
          mientras trabaja. Lo que se pliega son las miniaturas, que es lo que
          de verdad come pantalla. */}
      <div
        className={`${styles.collapsible} ${plegada ? styles.collapsed : ""}`}
        // Plegado no es solo invisible: `inert` lo saca del tabulador y de la
        // lectura asistida. Sin esto, quien navega con teclado seguiría
        // cayendo en ocho miniaturas que no se ven.
        inert={plegada}
      >
        <div className={styles.row}>
          <ol className={styles.list}>
            {steps.map((step, index) => {
              const isCurrent = step.id === currentId;
              const isSelected = step.id === selectedId;
              const isOrigin = step.kind === "origin";
              const copy = WORK_STEP_COPY[step.kind];
              const when = isOrigin
                ? "Prenda base"
                : stepTime.format(new Date(step.createdAt));

              return (
                <li key={step.id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.step}
                    aria-pressed={isSelected}
                    aria-current={isCurrent ? "step" : undefined}
                    // The visible caption is a bare date, which read out on its
                    // own says nothing about what it is or where it sits. The
                    // thumbnail cannot help — it is decorative here, because the
                    // garment it shows is exactly what a screen reader cannot
                    // convey.
                    aria-label={`Paso ${index + 1} de ${steps.length}, ${copy.label}, ${when}`}
                    onClick={() => onSelect(isSelected ? null : step.id)}
                  >
                    {/* Above the frame and not on top of it: an overlay would
                        cover the one thing the thumbnail is there to show, and
                        these steps differ from each other by details as small as
                        an emblem. The word carries the meaning and the colour
                        only makes it findable, so it still works for someone who
                        cannot tell the two hues apart. */}
                    <span className={`${styles.kind} ${styles[step.kind]}`}>
                      {copy.label}
                    </span>

                    <span className={styles.frame} title={copy.title}>
                      <Thumbnail
                        src={step.url}
                        alt=""
                        // The starting point belongs to the client's catalogue,
                        // not to this design: el hilván says so without a label.
                        provisional={isOrigin}
                      />
                    </span>

                    <span className={styles.meta}>{when}</span>

                    {isCurrent && (
                      <span className={styles.here}>Estás aquí</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className={styles.actions}>
            {/* Mirar los datos es un tercer verbo, distinto de previsualizar y de
                retomar, así que es su propio botón. Cargarle esto al clic de la
                miniatura habría hecho que un gesto significara dos cosas, que es
                exactamente lo que §7.4 de FASE_1_5 decidió no hacer. */}
            {shown && (
              <Button variant="secondary" onClick={() => setDetailsOpen(true)}>
                Ver datos
              </Button>
            )}

            {canResume ? (
              <Button
                variant="primary"
                onClick={() => selected && onResume(selected.id)}
                disabled={isResuming}
              >
                {isResuming ? "Volviendo…" : "Retomar desde aquí"}
              </Button>
            ) : (
              <p className={styles.hint}>
                {selected
                  ? "Es el paso en el que estás."
                  : "Elige un paso para volver a él. Viajar hacia atrás no cuesta."}
              </p>
            )}
          </div>
        </div>
      </div>

      <StepDetails
        step={shown}
        steps={steps}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </section>
  );
}
