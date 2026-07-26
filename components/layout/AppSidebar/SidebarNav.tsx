"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppSidebar.module.css";

interface NavItem {
  href: string;
  label: string;
  /** Path prefix that marks this item active (so /clients/[id] lights up too). */
  match: string;
  adminOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/clients", label: "Clientes", match: "/clients" },
  { href: "/admin/users", label: "Usuarios", match: "/admin", adminOnly: true },
];

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Navegación principal">
      {ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.navLink}
          aria-current={pathname.startsWith(item.match) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
