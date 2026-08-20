import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  /** What is missing. Never a blank area (STYLE_GUIDE §6). */
  title: string;
  /** One line saying what the missing thing is *for*, or how to get one. */
  hint?: string;
  /** `sm` for a panel inside a screen; `md` for a whole page's list. */
  size?: "sm" | "md";
}

/**
 * The empty state of a list, in one place.
 *
 * It was written by hand in six modules, and **three of them used the dashed
 * outline while three used a solid card border** — a rule the style guide
 * states (§4, el hilván: an empty state is provisional by definition) that half
 * the code did not follow, because following it depended on remembering it.
 * Extracting the component is what makes the rule structural.
 *
 * No action slot on purpose: today every caller puts its button in the header
 * row above. A prop that nothing passes is the dead `fullWidthTrigger` all over
 * again, so it gets added the day a caller needs it.
 */
export function EmptyState({ title, hint, size = "md" }: EmptyStateProps) {
  return (
    <div className={`${styles.root} ${styles[size]}`}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
