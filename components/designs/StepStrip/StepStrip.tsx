"use client";

import { Button } from "@/components/ui/Button/Button";
import { Thumbnail } from "@/components/ui/Thumbnail/Thumbnail";
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
  /** The garment it started from, which belongs to the client's catalogue. */
  isOrigin: boolean;
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
  if (steps.length === 0) return null;

  const spent = steps.reduce((total, step) => total + (step.costUsd ?? 0), 0);
  const selected = steps.find((step) => step.id === selectedId) ?? null;
  const canResume = canEdit && selected !== null && selected.id !== currentId;

  return (
    <section className={styles.strip} aria-label="Pasos del diseño">
      <div className={styles.head}>
        <span className={styles.label}>Pasos</span>
        <span className={styles.count}>{steps.length}</span>

        <div className={styles.spacer} />

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

      <div className={styles.row}>
        <ol className={styles.list}>
          {steps.map((step, index) => {
            const isCurrent = step.id === currentId;
            const isSelected = step.id === selectedId;
            const when = step.isOrigin
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
                  aria-label={`Paso ${index + 1} de ${steps.length}, ${when}`}
                  onClick={() => onSelect(isSelected ? null : step.id)}
                >
                  <span className={styles.frame}>
                    <Thumbnail
                      src={step.url}
                      alt=""
                      // The starting point belongs to the client's catalogue,
                      // not to this design: el hilván says so without a label.
                      provisional={step.isOrigin}
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
    </section>
  );
}
