"use client";

import { Icon } from "@/components/ui/Icon/Icon";
import styles from "./SearchInput.module.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * What is being searched, in plural and lowercase: "prendas base", "diseños".
   * The placeholder and the label are built from it, so the wording of every
   * search box in the app is decided here and not at each call site.
   */
  scope: string;
}

/**
 * The app's search box. Presentational on purpose: **the state belongs to the
 * caller**, because the two callers own it differently and neither is wrong.
 *
 * The catalog filters in memory over assets it already loaded, so local state
 * is right there. The design list is paged on the server, where local state
 * would only ever filter the page you are looking at — so it keeps the query in
 * the URL, which also survives a reload and the back button.
 *
 * One appearance, two owners. That is the alternative to two search boxes that
 * drift apart.
 */
export function SearchInput({ value, onChange, scope }: SearchInputProps) {
  return (
    <div className={styles.root}>
      <Icon name="search" size={16} />
      <input
        type="search"
        className={styles.input}
        placeholder={`Buscar en ${scope}…`}
        aria-label={`Buscar por nombre en ${scope}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
