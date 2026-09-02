"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button/Button";
import {
  MAX_TOLERANCE,
  type BackgroundRemoval,
} from "@/lib/background-removal";
import styles from "./LogoBackground.module.css";

/**
 * Past this share removed, the fill has stopped cutting out and started eating
 * the logo. It lives beside the warning it triggers.
 */
const OVERCUT_SHARE = 0.9;

interface LogoBackgroundProps {
  /** The layer's image could not be read, so nothing can be cut. */
  isBroken: boolean;
  /** Already transparent: `FASE_1_5` §6.3 step 1, the tool is not offered. */
  isCutOut: boolean;
  /** This layer is the one being cut right now. */
  isCutting: boolean;
  tolerance: number;
  onToleranceChange: (tolerance: number) => void;
  /** The proposal on screen, or null while it is being computed. */
  preview: BackgroundRemoval | null;
  isApplying: boolean;
  onStart: () => void;
  onCancel: () => void;
  onApply: () => void;
  canStart: boolean;
  canEdit: boolean;
}

/**
 * Taking the background off the selected logo, without leaving the canvas.
 *
 * Four states and no fifth: the image failed, it is already cut out, a cut is
 * on screen, or one can be started. Each says what it is and offers only what
 * makes sense there — while a proposal is showing, the tolerance is the only
 * decision, which is why nothing else appears beside it.
 *
 * It reports what it removed as a percentage rather than as "listo": a cut can
 * be right or ruinous and the difference is visible in that one number, so the
 * user is told before they decide to keep it.
 */
export function LogoBackground({
  isBroken,
  isCutOut,
  isCutting,
  tolerance,
  onToleranceChange,
  preview,
  isApplying,
  onStart,
  onCancel,
  onApply,
  canStart,
  canEdit,
}: LogoBackgroundProps) {
  const toleranceId = useId();

  if (isBroken) {
    return (
      <p className={styles.hint}>
        La imagen de esta capa no se pudo cargar, así que no se le puede quitar
        el fondo.
      </p>
    );
  }

  if (isCutting) {
    return (
      <>
        <label className={styles.sliderLabel} htmlFor={toleranceId}>
          Tolerancia
          <span className={styles.sliderValue}>
            {Math.round(tolerance * 100)}
          </span>
        </label>
        <input
          id={toleranceId}
          className={styles.slider}
          type="range"
          min={0}
          max={Math.round(MAX_TOLERANCE * 100)}
          step={1}
          value={Math.round(tolerance * 100)}
          onChange={(event) =>
            onToleranceChange(Number(event.target.value) / 100)
          }
          disabled={isApplying}
        />
        <p className={styles.hint}>
          {preview
            ? `Se quitó el ${Math.round(
                preview.removedShare * 100
              )}% de la imagen. Sube la tolerancia si queda fondo, bájala si se come el logotipo.`
            : "Calculando…"}
        </p>
        {preview && preview.removedShare > OVERCUT_SHARE && (
          <p className={styles.warning}>
            Con esta tolerancia se está borrando casi todo el logotipo.
          </p>
        )}
        <div className={styles.cutActions}>
          <Button variant="secondary" onClick={onCancel} disabled={isApplying}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={onApply}
            disabled={!preview || isApplying}
          >
            {isApplying ? "Quitando…" : "Quitar fondo"}
          </Button>
        </div>
      </>
    );
  }

  if (isCutOut) {
    return (
      <p className={styles.hint}>
        Este logotipo ya tiene el fondo transparente. No hace falta recortarlo.
      </p>
    );
  }

  return (
    <>
      <p className={styles.hint}>
        El logotipo tiene fondo. Puedes recortarlo sin salir de acá; se guarda
        como un logotipo nuevo y el original no se toca.
      </p>
      <Button
        variant="secondary"
        onClick={onStart}
        disabled={!canStart}
        title={
          canEdit ? undefined : "No tienes permisos para editar este cliente."
        }
      >
        Quitar fondo
      </Button>
    </>
  );
}
