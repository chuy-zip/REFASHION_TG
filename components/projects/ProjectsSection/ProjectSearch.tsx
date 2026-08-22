"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
 * It writes `?q=` on the client route, where `?tab=projects` also lives now.
 * That is why the existing parameters are carried over instead of rebuilt: this
 * used to start from an empty URLSearchParams, which was harmless while the tab
 * was component state, and would have thrown the user back to "Información" on
 * the first keystroke the moment the tab moved into the URL.
 */
export function ProjectSearch({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(query);

  useEffect(() => {
    // Nothing to push on mount, or once the server has caught up with what the
    // box already shows.
    if (value === query) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      params.delete("page");

      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, query, pathname, router, searchParams]);

  return <SearchInput value={value} onChange={setValue} scope="proyectos" />;
}
