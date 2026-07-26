"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
}

/**
 * Modal built on the native <dialog>: focus trapping, Esc to dismiss and the
 * backdrop come from the platform rather than hand-rolled JS.
 *
 * Declarative wrapper over an imperative element — the parent owns `open` and
 * this syncs showModal()/close() to it.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

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
      onClose={onClose}
    >
      {children}
    </dialog>
  );
}
