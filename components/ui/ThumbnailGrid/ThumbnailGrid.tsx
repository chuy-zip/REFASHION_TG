import type { ReactNode } from "react";
import styles from "./ThumbnailGrid.module.css";

interface ThumbnailGridProps {
  /** True when there is nothing to lay out; the empty state replaces the grid. */
  isEmpty: boolean;
  emptyTitle: string;
  emptyHint?: string;
  /**
   * How wide a column gets. `lg` is for the catalog, where the page is the
   * images and there is a whole monitor to spend on them; `md` is for the
   * picker, which lives inside a 34rem dialog and would fit two per row.
   */
  size?: "md" | "lg";
  children: ReactNode;
}

/**
 * Responsive grid of image cards, plus the empty state that belongs with it —
 * per the style guide an empty grid is never a blank area, it says what is
 * missing. The cards themselves come from the caller: the catalog renders
 * manageable ones (gear menu), the picker selectable ones.
 */
export function ThumbnailGrid({
  isEmpty,
  emptyTitle,
  emptyHint,
  size = "md",
  children,
}: ThumbnailGridProps) {
  if (isEmpty) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{emptyTitle}</p>
        {emptyHint && <p className={styles.emptyHint}>{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className={`${styles.grid} ${styles[size]}`}>{children}</div>
  );
}
