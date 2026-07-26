import styles from "./Skeleton.module.css";

/**
 * A neutral placeholder block for loading states. Size and shape come from the
 * caller's className, so one primitive covers titles, rows, cards, etc.
 *
 * Decorative only — hidden from assistive tech; the surrounding loading.tsx
 * carries the semantics.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
