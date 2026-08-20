"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/SearchInput/SearchInput";

/**
 * The design list's search box, bound to the URL instead of to local state.
 *
 * It has to be: the list is paged on the server, so filtering in memory would
 * only ever filter the twelve designs currently on screen. Keeping the query in
 * `?q=` also means a reload and the back button do the right thing.
 *
 * Typing is debounced so a five-letter word is one navigation and not five, and
 * `page` is dropped on every change: staying on page 3 of a different result
 * set shows an empty screen for no visible reason.
 */
export function DesignSearch({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(query);

  useEffect(() => {
    // Nothing to push on mount, or once the server has caught up with what the
    // box already shows.
    if (value === query) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());

      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, query, pathname, router]);

  return <SearchInput value={value} onChange={setValue} scope="diseños" />;
}
