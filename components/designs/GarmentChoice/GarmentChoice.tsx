"use client";

import { Button } from "@/components/ui/Button/Button";
import type { AssetWithUrl } from "@/lib/assets";
import styles from "./GarmentChoice.module.css";

interface GarmentChoiceProps {
  /** The garment where the design's cursor stands. Always current. */
  workingImageUrl: string;
  /** The newest composition, or null when the design has none. */
  composition: AssetWithUrl | null;
  /** True when the garment changed after that composition was flattened. */
  outdated: boolean;
  /** null means the clean garment. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onContinue: () => void;
}

/**
 * One question, asked once, before a try-on costs anything.
 *
 * **Why a step and not a control inside the panel.** The try-on consumes one
 * garment and the user has two candidates: the garment as it stands, and the
 * newest composition with the logos flattened in. That choice used to live in
 * a picker on another tab, so the model tabs acted on a decision taken out of
 * sight. Repeating the picker on all three tabs was the other option and it is
 * worse: the same control three times reads as three settings.
 *
 * **The real job is the realisation.** Put side by side, a composition that
 * predates the last edit is visibly what it is, and this is the moment someone
 * notices "I never applied the logos to what I just did". A warning after
 * choosing arrives too late to be that.
 *
 * It does not block. Presenting the clean garment is a legitimate decision,
 * and the design may have no composition at all — in which case the caller
 * skips this screen entirely, because a choice with one option is not a choice.
 */
export function GarmentChoice({
  workingImageUrl,
  composition,
  outdated,
  selectedId,
  onSelect,
  onContinue,
}: GarmentChoiceProps) {
  return (
    <div className={styles.step}>
      <div className={styles.head}>
        <h2 className={styles.title}>¿Qué prenda se prueba?</h2>
        <p className={styles.hint}>
          La prueba virtual recibe exactamente lo que elijas aquí.
        </p>
      </div>

      <div className={styles.options}>
        <button
          type="button"
          className={styles.option}
          aria-pressed={selectedId === null}
          onClick={() => onSelect(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
          <img
            className={styles.thumb}
            src={workingImageUrl}
            alt=""
            crossOrigin="anonymous"
          />
          <span className={styles.optionName}>Prenda sin logotipos</span>
          <span className={styles.optionNote}>Como está ahora mismo</span>
        </button>

        {composition && (
          <button
            type="button"
            className={styles.option}
            aria-pressed={selectedId === composition.id}
            onClick={() => onSelect(composition.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
            <img
              className={styles.thumb}
              src={composition.url}
              alt=""
              crossOrigin="anonymous"
            />
            <span className={styles.optionName}>Con logotipos</span>
            {/* Marked here and not after choosing: this is the moment the
                staleness has to be visible, because it is what makes the two
                options different. */}
            <span
              className={outdated ? styles.optionStale : styles.optionNote}
            >
              {outdated
                ? "No incluye tu último cambio en la prenda"
                : "Incluye los logotipos aplicados"}
            </span>
          </button>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={onContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
