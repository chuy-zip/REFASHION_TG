"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /** Closes and puts the caret back where the user left it. */
  function closeAndRestore() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Opening moves focus INTO the menu. role="menu" is a promise that the thing
  // is operable from the keyboard, and a menu that opens behind the caret keeps
  // none of it: Tab would walk to whatever follows the trigger in the document,
  // not to the items the user just asked for.
  useEffect(() => {
    if (!open) return;
    focusableItems()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function focusableItems(): HTMLButtonElement[] {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []
    );
  }

  /** Arrow keys walk the items and wrap; Home/End jump to the ends. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAndRestore();
      return;
    }

    const focusable = focusableItems();
    if (focusable.length === 0) return;

    const current = focusable.indexOf(
      document.activeElement as HTMLButtonElement
    );

    const target =
      event.key === "ArrowDown"
        ? (current + 1) % focusable.length
        : event.key === "ArrowUp"
        ? (current - 1 + focusable.length) % focusable.length
        : event.key === "Home"
        ? 0
        : event.key === "End"
        ? focusable.length - 1
        : -1;

    if (target === -1) return;
    event.preventDefault();
    focusable[target].focus();
  }

  return (
    <div
      className={styles.root}
      ref={rootRef}
      // Tabbing past the last item leaves the menu; leaving it open would strand
      // a floating panel over content the user has already moved on from. The
      // caret is not restored here — it has legitimately gone somewhere else.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="settings" />
      </button>

      {open && (
        <div
          className={styles.menu}
          role="menu"
          ref={menuRef}
          aria-label={label}
          onKeyDown={handleKeyDown}
        >
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
                closeAndRestore();
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
