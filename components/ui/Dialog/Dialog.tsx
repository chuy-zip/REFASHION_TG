"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  /** Fires on Esc as well as on close(); the parent flips `open` to false. */
  onClose: () => void;
  /** id of the element naming the dialog, for screen readers. */
  labelledBy: string;
  children: ReactNode;
  /** Extra class for per-instance overrides (e.g. a wider dialog for image preview). */
  className?: string;
  /**
   * Close on a click on the backdrop. Off by default: in a form, a stray click
   * outside would throw away what was typed. Meant for view-only dialogs.
   */
  closeOnBackdrop?: boolean;
}

/**
 * Modal built on the native <dialog>: focus trapping, Esc to dismiss and the
 * backdrop come from the platform rather than hand-rolled JS.
 *
 * Declarative wrapper over an imperative element — the parent owns `open` and
 * this syncs showModal()/close() to it.
 *
 * **Un cierre es de su propio diálogo y de ningún otro.** El `close` nativo no
 * burbujea, pero el de React sí: sus eventos sintéticos viajan por el árbol de
 * componentes, no por el DOM. Un diálogo dentro de otro —las sugerencias de
 * prompt dentro del generador de modelos— cerraba los dos de un golpe, y el
 * síntoma era desconcertante: el texto elegido sí quedaba puesto, pero había
 * que volver a abrir para verlo.
 */
/**
 * **El relleno lo pone el contenido, no este componente.** `.dialog` va con
 * `padding: 0` a propósito, para que un diálogo pueda mostrar una imagen de
 * borde a borde si le hace falta. Todos los que no lo necesitan envuelven su
 * contenido en un elemento con `padding: var(--space-20)`.
 *
 * Está escrito acá porque no estaba: un contenido nuevo salió sin relleno, con
 * el título pegado al borde, y la convención solo existía en los tres que ya
 * la cumplían.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className,
  closeOnBackdrop = false,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Where the press started. Selecting text inside and releasing outside fires
  // a click on the dialog too, and that must not close it.
  const pressedOutside = useRef(false);

  // A click on the backdrop reaches the <dialog> itself, so the test is whether
  // the point falls outside its box, not which element was hit.
  const isOutside = (event: MouseEvent<HTMLDialogElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    );
  };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={[styles.dialog, className].filter(Boolean).join(" ")}
      aria-labelledby={labelledBy}
      onClose={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onMouseDown={
        closeOnBackdrop
          ? (event) => {
              pressedOutside.current = isOutside(event);
            }
          : undefined
      }
      onClick={
        closeOnBackdrop
          ? (event) => {
              if (pressedOutside.current && isOutside(event)) {
                event.currentTarget.close();
              }
              pressedOutside.current = false;
            }
          : undefined
      }
    >
      {children}
    </dialog>
  );
}
