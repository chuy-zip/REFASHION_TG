"use client";

import styles from "./PillTabs.module.css";

export interface PillOption {
  key: string;
  label: string;
  /** Shown next to the label; omit when there is nothing to count. */
  count?: number;
}

interface PillTabsProps {
  options: PillOption[];
  selected: string;
  onSelect: (key: string) => void;
  /** Names the tablist for screen readers, e.g. "Tipo de recurso". */
  label: string;
}

/**
 * Strip of filters for a collection, applied in place (no navigation).
 * Deliberately dumb: it renders options and reports the selected key, so the
 * same strip serves the client catalog and the starting-point picker without
 * either one's concerns leaking into it.
 *
 * These are toggle buttons, NOT tabs, and the distinction is not pedantry.
 * `role="tab"` is a promise of the tab pattern: arrow keys walk the strip, only
 * one stop in the tab order, and each tab owns a `tabpanel` it points at with
 * `aria-controls`. None of that existed here, and none of it should — nothing
 * is being switched between, one list is being narrowed. So the roles came off
 * and the markup went back to what it always was underneath: buttons that say
 * whether they are on. Plain buttons are each Tab-reachable and fire on
 * Enter/Space with no JS at all, which is the behaviour the strip already had
 * and the ARIA was quietly contradicting.
 */
export function PillTabs({ options, selected, onSelect, label }: PillTabsProps) {
  return (
    <div className={styles.pills} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={selected === option.key}
          className={styles.pill}
          onClick={() => onSelect(option.key)}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={styles.count}>{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
