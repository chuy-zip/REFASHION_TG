import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

/** The four variants the app allows. One primary per screen. */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "secondary",
  // Defaults to "button": a bare <button> inside a form submits it, which is
  // almost never what a Cancel or Delete trigger wants.
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.base, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
