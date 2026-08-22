"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import styles from "./Pager.module.css";

interface PagerProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Total rows before paging. */
  total: number;
  /** Plural, lowercase: "diseños", "proyectos". */
  noun: string;
}

/**
 * Page control for a server-paged list.
 *
 * The page lives in the URL, not in state: a paged screen has to survive a
 * reload, the back button and a shared link, and the server needs the number
 * anyway to build the query. Every other search param is carried over, so
 * paging inside a filtered list keeps the filter.
 *
 * It renders nothing when everything fits on one page. A pager that says
 * "1 a 3 de 3" is furniture.
 */
export function Pager({ page, pageSize, total, noun }: PagerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  function hrefFor(target: number) {
    const params = new URLSearchParams(searchParams);
    if (target <= 1) params.delete("page");
    else params.set("page", String(target));

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const linkClass = `${buttonStyles.base} ${buttonStyles.secondary}`;

  return (
    <nav className={styles.root} aria-label={`Paginación de ${noun}`}>
      <span className={styles.count}>
        {first} a {last} de {total} {noun}
      </span>

      <span className={styles.buttons}>
        {/* A disabled link is not a thing: at the ends it becomes plain text,
            so it is not focusable and cannot be followed. */}
        {page > 1 ? (
          <Link className={linkClass} href={hrefFor(page - 1)}>
            Anteriores
          </Link>
        ) : (
          <span className={`${linkClass} ${styles.spent}`}>Anteriores</span>
        )}

        {page < lastPage ? (
          <Link className={linkClass} href={hrefFor(page + 1)}>
            Siguientes
          </Link>
        ) : (
          <span className={`${linkClass} ${styles.spent}`}>Siguientes</span>
        )}
      </span>
    </nav>
  );
}
