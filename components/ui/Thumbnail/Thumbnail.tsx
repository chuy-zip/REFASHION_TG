"use client";

import { useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import styles from "./Thumbnail.module.css";

interface ThumbnailProps {
  /** Signed URL, or null when the thing has no image yet. */
  src: string | null;
  alt: string;
  /** What to say when `src` is null. The frame turns provisional with it. */
  emptyLabel?: string;
  /**
   * Dashed frame even when there is an image: this one is not part of the
   * design. Today that is the history's starting point, which belongs to the
   * client's catalogue.
   */
  provisional?: boolean;
  /**
   * `top` when the frame is the head of a bordered card and only its upper
   * corners are rounded; `all` when the image stands on its own, which is what
   * an image surface does (STYLE_GUIDE §4).
   */
  corners?: "all" | "top";
  /** Overlays inside the frame, above the image. */
  children?: ReactNode;
}

/**
 * A square image on the sunken surface: the frame every list in the app puts
 * around a picture.
 *
 * It was written by hand in four modules with the same twenty lines, and the
 * copies had already drifted: the catalog faded its images in behind a
 * skeleton while the others popped them in. Extracting it settles that in the
 * direction the style guide asks for (skeleton, never a spinner), so every
 * list now behaves the same without anyone having to remember.
 *
 * The image always covers the square. That is a real decision and not laziness:
 * a grid of thumbnails is scanned, and letterboxing every card to fit its
 * subject makes the row impossible to read.
 */
export function Thumbnail({
  src,
  alt,
  emptyLabel = "Sin imagen",
  provisional = false,
  corners = "all",
  children,
}: ThumbnailProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // A missing image is provisional, so it takes el hilván — except when this
  // frame only heads a card. There the card owns the outline, and a dashed
  // rectangle ending halfway down it reads as a mistake rather than a state.
  const isDashed = provisional || (!src && corners === "all");

  const frame = [styles.frame, styles[corners], isDashed ? styles.provisional : ""]
    .filter(Boolean)
    .join(" ");

  if (!src) {
    return (
      <div className={frame}>
        <span className={styles.empty}>{emptyLabel}</span>
        {children}
      </div>
    );
  }

  return (
    <div className={frame}>
      {!isLoaded && <Skeleton className={styles.skeleton} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
      <img
        className={`${styles.image} ${isLoaded ? styles.loaded : ""}`}
        src={src}
        alt={alt}
        // Una miniatura nunca es lo primero que hay que mirar, y acá se cargan
        // ocho a la vez de imágenes que pesan megabytes. Bajar su prioridad y
        // sacar la decodificación del hilo principal no ahorra un solo byte,
        // pero deja que la imagen grande y la pantalla lleguen antes.
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        // ONE request mode for every R2 image in the app, and it is not
        // optional here.
        //
        // R2 answers with `Vary: Origin`, and an <img> without this attribute
        // sends no Origin at all — so the response comes back with no
        // `Access-Control-Allow-Origin` and is cached that way. The canvas then
        // asks for the SAME url in CORS mode, finds that cached response, and
        // the browser blocks it. Nothing is wrong with the object, the policy
        // or the signature: the two requests simply disagreed about the mode.
        //
        // It surfaced when the step strip started showing thumbnails of the
        // very images the canvas draws. It is the second time this project
        // pays for it (APRENDIZAJES §5.9b), which is why the fix is a rule and
        // not a patch: every R2 image is requested the same way, so the two
        // can never poison each other.
        crossOrigin="anonymous"
        onLoad={() => setIsLoaded(true)}
      />
      {children}
    </div>
  );
}
