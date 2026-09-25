import styles from "./WorkingOverlay.module.css";

interface WorkingOverlayProps {
  /** What is being done, in the user's words. Shown under the sweeping band. */
  label: string;
}

/**
 * The veil that covers an image while a model works on it.
 *
 * **Over the image, not just a disabled button.** A generation takes 5 to 20
 * seconds. The only signal used to be the button going grey, which is the same
 * thing a button does when a field is empty, so a long wait looked like a
 * refusal. The work happens TO the image, so that is where it has to be seen.
 *
 * **It veils rather than hides.** What the user is waiting for is a change to
 * that picture, and covering it removes the only reference they have to judge
 * the result against.
 *
 * Extracted from the editing screen, where it was measured first, so the two
 * places cannot drift apart. The parent has to be positioned: this fills it.
 */
export function WorkingOverlay({ label }: WorkingOverlayProps) {
  return (
    <div className={styles.working} role="status">
      <span className={styles.sweep} aria-hidden="true" />
      <p className={styles.text}>{label}</p>
    </div>
  );
}
