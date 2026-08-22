import styles from "./Badge.module.css";

/**
 * Semantic weight of the badge, not a colour name — so the palette can change
 * in globals.css without every caller being rewritten.
 */
export type BadgeTone = "neutral" | "success" | "muted" | "accent";

/**
 * Small status label. Deliberately unaware of what it is labelling: projects
 * and designs have different status vocabularies, so each domain maps its own
 * status to a tone + label (see PROJECT_STATUS_COPY / DESIGN_STATUS_COPY)
 * rather than this component learning about both.
 */
export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
  );
}
