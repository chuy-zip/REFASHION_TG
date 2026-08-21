"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/SearchInput/SearchInput";

/**
 * The project list's search box, bound to the URL for the same reason as the
 * design list's: the list is paged on the server, so filtering in memory would
 * only ever filter the six projects currently on screen.
 *
 * Typing is debounced so a word is one navigation and not five, and `page` is
 * dropped on every change: staying on page 3 of a different result set shows an
 * empty screen for no visible reason.
 *
 * It writes `?q=` on the client route, which is also where the Proyectos tab
 * lives — the tab itself is component state and survives the soft navigation.
 */
export function ProjectSearch({ query }: { query: string }) {
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

  return <SearchInput value={value} onChange={setValue} scope="proyectos" />;
}
