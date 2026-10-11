"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import styles from "./ModeSwitchDialog.module.css";

interface ModeSwitchDialogProps {
  /** What is about to be lost, or null when the dialog is closed. */
  pending: string | null;
  onStay: () => void;
  onDiscard: () => void;
}

/**
 * The question asked before leaving a mode with unfinished work in it.
 *
 * **It replaces an undo that crossed modes.** Switching used to push the
 * painted region onto the shared undo stack, so a mis-click on the mode select
 * cost one Ctrl+Z. The same stack let that region come back inside the other
 * mode: a recolour region reappeared in "Editar por zonas" and was what the
 * next generation sent to the model. Now nothing survives the switch, and this
 * is the safety net, placed before anything is lost instead of after.
 *
 * "Seguir aquí" comes first so it is what the native dialog focuses: Enter
 * keeps the work, and discarding takes a deliberate choice.
 */
export function ModeSwitchDialog({
  pending,
  onStay,
  onDiscard,
}: ModeSwitchDialogProps) {
  const titleId = useId();

  return (
    <Dialog open={pending !== null} onClose={onStay} labelledBy={titleId}>
      <div className={styles.content}>
        <h2 className={styles.title} id={titleId}>
          Hay cambios sin aplicar
        </h2>
        <p className={styles.text}>{pending}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onStay}>
            Seguir aquí
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Descartar y cambiar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
