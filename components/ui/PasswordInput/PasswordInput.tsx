"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "@/components/ui/Icon/Icon";
import styles from "./PasswordInput.module.css";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  /** Styling for the input itself; comes from the calling form's module.css. */
  className?: string;
};

/**
 * Password field that starts masked and can be revealed.
 *
 * Masked is the default everywhere, including the admin's "contraseña
 * provisional": the admin does need to read it to pass it on, but that is a
 * deliberate act, not a reason to leave it in plain sight of whoever walks by.
 *
 * `type` is intentionally not accepted as a prop, so no caller can turn this
 * back into a plain text field.
 */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={styles.wrap}>
      <input
        {...props}
        type={isVisible ? "text" : "password"}
        className={[styles.input, className].filter(Boolean).join(" ")}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setIsVisible((value) => !value)}
        disabled={props.disabled}
        aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        <Icon name={isVisible ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
  );
}
