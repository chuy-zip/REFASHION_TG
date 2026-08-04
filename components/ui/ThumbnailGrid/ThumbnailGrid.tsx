import type { ReactNode } from "react";
import styles from "./ThumbnailGrid.module.css";

interface ThumbnailGridProps {
  /** True when there is nothing to lay out; the empty state replaces the grid. */
  isEmpty: boolean;
  emptyTitle: string;
  emptyHint?: string;
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

  return <div className={styles.grid}>{children}</div>;
}
