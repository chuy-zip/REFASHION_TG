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
 * Rounded tab strip for filtering a collection in place (no navigation).
 * Deliberately dumb: it renders options and reports the selected key, so the
 * same strip serves the client catalog and the starting-point picker without
 * either one's concerns leaking into it.
 */
export function PillTabs({ options, selected, onSelect, label }: PillTabsProps) {
  return (
    <div className={styles.pills} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={selected === option.key}
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
