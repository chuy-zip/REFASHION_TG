"use client";

import { useEffect, useRef, useState } from "react";

export type ImageStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Loads an image for use in a Konva canvas.
 *
 * `crossOrigin = "anonymous"` is the whole point of this hook and it is not
 * optional: without it the canvas becomes *tainted* the moment an R2 image is
 * drawn on it, and `toBlob()` fails with a SecurityError at export time. The
 * trap is that everything looks perfect on screen until then. It needs the
 * bucket's CORS policy to allow GET as well —
 * either half missing produces the same late failure.
 *
 * Setting the attribute *before* `src` matters: assigning src first starts the
 * fetch without the CORS request headers.
 *
 * The result is keyed by the URL it came from and the status is **derived**,
 * not stored. That way a changing `src` reports "loading" immediately without
 * the effect writing state on its way through, and a slow response for an old
 * URL can never be mistaken for the current one.
 */
export function useCrossOriginImage(src: string | null) {
  const [loaded, setLoaded] = useState<{
    src: string;
    element: HTMLImageElement;
  } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const element = new window.Image();
    element.crossOrigin = "anonymous";

    element.onload = () => {
      if (!cancelled) setLoaded({ src, element });
    };
    element.onerror = () => {
      if (!cancelled) setFailedSrc(src);
      // The browser gives an <img> load failure no reason: onerror carries no
      // status and no message, so a 403 from an expired signature, a missing
      // object and a CORS rejection all arrive identically. Printing the URL is
      // the only way to tell them apart, and the Network tab has the status.
      //
      // Same lesson as the 42703 spike: a swallowed cause turns a specific
      // failure into a vague one, and the vague one is the expensive kind.
      if (process.env.NODE_ENV === "development") {
        console.error("[canvas] la imagen no cargó:", src);
      }
    };

    element.src = src;

    // Signed URLs expire and a design can sit open for a while: cancelling
    // keeps a slow load from overwriting a newer one.
    return () => {
      cancelled = true;
    };
  }, [src]);

  const image = src && loaded?.src === src ? loaded.element : null;

  const status: ImageStatus = !src
    ? "idle"
    : image
      ? "loaded"
      : failedSrc === src
        ? "error"
        : "loading";

  return { image, status };
}

/** What happened to one layer's image. */
export type LoadedImage = HTMLImageElement | "error" | undefined;

/**
 * The same load, for many URLs at once.
 *
 * Exists so that **no image loading happens inside the Konva tree**. Components
 * rendered under `<Stage>` go through react-konva's own reconciler, and a
 * component that both owns state and draws a node there is the hardest kind to
 * reason about when something does not appear. Loading here, in ordinary React,
 * and handing the finished `HTMLImageElement` down as a prop keeps the nodes
 * inside the canvas purely declarative.
 *
 * Results are keyed by URL and each URL is fetched once, so re-renders are free
 * and adding a layer does not restart the loads already in flight.
 */
export function useCrossOriginImages(urls: string[]): Record<string, LoadedImage> {
  const [byUrl, setByUrl] = useState<Record<string, LoadedImage>>({});
  const started = useRef(new Set<string>());

  // A stable dependency: the array identity changes on every render, the
  // contents rarely do.
  const joined = urls.join("|");

  useEffect(() => {
    for (const url of joined ? joined.split("|") : []) {
      if (started.current.has(url)) continue;
      started.current.add(url);

      const element = new window.Image();
      element.crossOrigin = "anonymous";
      element.onload = () =>
        setByUrl((current) => ({ ...current, [url]: element }));
      element.onerror = () =>
        setByUrl((current) => ({ ...current, [url]: "error" }));
      element.src = url;
    }
    // Deliberately no cancellation: results are keyed by URL, so a late load
    // cannot be mistaken for another one, and dropping it would leave the layer
    // stuck forever (the URL is already marked as started).
  }, [joined]);

  return byUrl;
}
