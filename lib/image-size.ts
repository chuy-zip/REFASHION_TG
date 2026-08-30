/**
 * How big is this image, asked in the browser.
 *
 * Exists because of where the answer is cheap. At upload time the browser is
 * about to decode the image anyway to show a preview, so its size is a fact
 * already in hand. On the server it is the opposite: the only way to ask is to
 * download the object from R2 and decode it, which costs egress and latency on
 * the hot path of a paid operation.
 *
 * Módulo 2 needs both numbers on every request — image inference takes an
 * explicit `width` and `height`, and the mask has to match the seed image pixel
 * for pixel. Migration 016 gave `assets` the columns; this is what fills them.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Decodes just far enough to read the intrinsic size, then releases the object
 * URL. Returns null instead of throwing: a size we could not read is exactly
 * what `width_px = null` already means, and a failure here must never stop an
 * upload that is otherwise fine.
 */
export function measureImageBlob(blob: Blob): Promise<ImageSize | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    function done(size: ImageSize | null) {
      URL.revokeObjectURL(url);
      resolve(size);
    }

    image.onload = () =>
      done(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null
      );
    image.onerror = () => done(null);
    image.src = url;
  });
}
