"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon/Icon";
import styles from "./Disclosure.module.css";

interface DisclosureProps {
  /** What is inside, said in the words of someone who has not opened it yet. */
  label: string;
  /**
   * Closed by default, which is the whole point: a disclosure exists to keep
   * something out of the way until it is wanted.
   */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A section that folds away until it is asked for.
 *
 * Built on `<details>` and `<summary>` rather than on a button and a piece of
 * state, and that is the entire reason this file is short. The browser already
 * gives the pattern its keyboard (Enter and Space), its expanded/collapsed
 * announcement, and its find-in-page behaviour — a hand-rolled version has to
 * reimplement all three and usually reimplements the first two.
 *
 * What is left here is the part the browser does not do: hiding the default
 * triangle, which cannot be styled, and putting one of the app's own icons in
 * its place.
 */
export function Disclosure({
  label,
  defaultOpen = false,
  children,
}: DisclosureProps) {
  return (
    <details className={styles.root} open={defaultOpen}>
      <summary className={styles.summary}>
        <span className={styles.label}>{label}</span>
        {/* Points down when closed and up when open, so it reads as "there is
            more below" rather than as decoration. It is aria-hidden because
            <summary> already announces the state it is drawing. */}
        <span className={styles.chevron}>
          <Icon name="chevronDown" size={18} />
        </span>
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
