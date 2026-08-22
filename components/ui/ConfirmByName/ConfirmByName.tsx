"use client";

import { useId } from "react";
import styles from "./ConfirmByName.module.css";

interface ConfirmByNameProps {
  /** The text the user has to type: the name of what is about to be destroyed. */
  expected: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Whether what was typed unlocks the action.
 *
 * Trimmed and case-insensitive on purpose. The point is to make someone read
 * **which** thing they are deleting, not to test their typing: rejecting
 * "american espresso" would only teach people to copy and paste the name,
 * which defeats the whole exercise.
 *
 * Exported so the rule is written once — the dialog needs it to enable its
 * button and this component needs it to say whether the field matches.
 */
export function confirmationMatches(value: string, expected: string): boolean {
  return (
    value.trim().localeCompare(expected.trim(), undefined, {
      sensitivity: "accent",
    }) === 0
  );
}

/**
 * Type-the-name confirmation for a destructive action.
 *
 * Reserved for the two deepest cascades (a client, a project), and deliberately
 * **not** used on a single image or design. The pattern works by breaking
 * muscle memory; put it on everything and the muscle memory rebuilds one level
 * up, with people typing the name without reading, and all that is left is the
 * friction.
 *
 * It asks for the resource's name rather than a fixed word like "ELIMINAR",
 * because the failure mode here is not "I did not mean to delete" but **"I
 * deleted the wrong one"** — the cards look alike in a grid, and the menu that
 * opens this lives inside the record itself.
 */
export function ConfirmByName({
  expected,
  value,
  onChange,
  disabled = false,
}: ConfirmByNameProps) {
  const fieldId = useId();

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        Escribe <span className={styles.expected}>{expected}</span> para
        confirmar.
      </label>
      <input
        id={fieldId}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${fieldId}-hint`}
      />
      <p id={`${fieldId}-hint`} className={styles.hint}>
        Sin distinguir mayúsculas.
      </p>
    </div>
  );
}
