"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon/Icon";
import styles from "./Menu.module.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive item, rendered in the danger color. */
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

interface MenuProps {
  /** Accessible label for the trigger (e.g. "Opciones del cliente"). */
  label: string;
  /** Optional heading inside the menu, e.g. the resource name. */
  header?: string;
  items: MenuItem[];
}

/**
 * Gear-triggered dropdown for a resource's actions. Groups edit/delete behind a
 * deliberate affordance so destructive actions are not loose, always-visible
 * buttons. Closes on outside click, Escape, or selecting an item.
 */
export function Menu({ label, header, items }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="settings" />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          {header && <p className={styles.header}>{header}</p>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`${styles.item} ${item.danger ? styles.danger : ""}`}
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
