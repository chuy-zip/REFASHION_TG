/**
 * Changing the colour of a masked region, in the browser, without generating
 * anything (Módulo 2).
 *
 * `FASE_2_INPAINTING` §2.3 chose this after finding that **diffusion models do
 * not honour colour codes reliably** — an open research problem, not a
 * limitation of one provider (ColorPeel, arXiv 2407.07197). An exact blue in
 * the prompt comes back as *a* dark blue, not **that** blue. For a quoting tool the
 * colour is the deliverable: a client who approves one blue and receives
 * another has a complaint, not a preference.
 *
 * So the colour has two paths and this is the exact one: the hex that comes out
 * is the hex that went in, it costs nothing, and it is instant enough to
 * preview while the picker moves. The generative path stays for what this
 * cannot do — printed patterns, a change of material, a different collar.
 *
 * **How it keeps the fabric.** A garment photo carries its folds and shadows in
 * its *luminance*, not its hue. So each pixel keeps its own brightness relative
 * to the region's average, and only takes the new hue and saturation. Flatten
 * the luminance instead and the shirt turns into a paper cut-out.
 *
 * Same family as `lib/background-removal.ts`: pure, synchronous, no dependency,
 * no network — and the same CORS caveat, since `getImageData()` throws on a
 * tainted canvas exactly like `toBlob()` does (APRENDIZAJES §5.9b).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RRGGBB` (or `#RGB`) to channels. Null when the string is not a colour. */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");

  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const pair = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase();
}

/**
 * Rec. 709 luma. Weighted, not a plain average, because the eye is far more
 * sensitive to green than to blue: an unweighted mean makes a yellow fold and a
 * blue one read as different depths when they are the same.
 */
function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface RecolorOptions {
  /** The garment, already loaded and CORS-clean. */
  image: HTMLImageElement;
  /**
   * Where to recolour: white means change, black means keep, grey blends.
   * Same convention as the inpainting mask, so one painted mask drives both
   * paths and the user never learns that there are two.
   */
  mask: HTMLCanvasElement;
  /** The colour the user picked, exactly. */
  target: Rgb;
}

/**
 * Returns a new canvas with the masked region recoloured.
 *
 * The source image is never touched: like the background removal, this produces
 * a new image and leaves the original alone, because the original may be the
 * working image of other steps in the strip.
 */
export function recolorRegion({
  image,
  mask,
  target,
}: RecolorOptions): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;

  // The mask is painted at canvas scale, which is not the image's scale. Rather
  // than resample it by hand, let the 2D context do it: drawing it into a
  // buffer the size of the image is one call and uses the browser's own
  // smoothing.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskCtx) return canvas;
  maskCtx.drawImage(mask, 0, 0, width, height);
  const maskPixels = maskCtx.getImageData(0, 0, width, height).data;

  // First pass: the average brightness of what is actually being recoloured.
  // It has to be the region's own average and not the whole image's — a white
  // shirt on a dark background would otherwise come out washed out, because the
  // background would drag the reference down.
  let sum = 0;
  let count = 0;

  for (let i = 0; i < maskPixels.length; i += 4) {
    if (maskPixels[i] < 8) continue;
    const p = i;
    sum += luma({ r: pixels[p], g: pixels[p + 1], b: pixels[p + 2] });
    count += 1;
  }

  if (count === 0) return canvas;

  const referenceLuma = sum / count;
  const targetLuma = luma(target);

  // Guard against a division by ~0 on an almost-black region: there is no fold
  // information left to preserve there, and this is the known limit of the
  // method (`FASE_2_INPAINTING` §2.3, "prenda oscura hacia un color claro").
  const safeReference = Math.max(referenceLuma, 1);

  for (let i = 0; i < pixels.length; i += 4) {
    const weight = maskPixels[i] / 255;
    if (weight === 0) continue;

    const original = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };

    // The pixel's brightness *relative to its region* is what carries the fold.
    // Scale the target colour by it and the shadow survives the change of hue.
    const ratio = luma(original) / safeReference;
    const scale = targetLuma > 0 ? ratio : 1;

    const recolored = {
      r: target.r * scale,
      g: target.g * scale,
      b: target.b * scale,
    };

    // Grey in the mask blends, so a feathered edge does not leave a hard seam
    // between the recoloured region and the rest of the garment.
    pixels[i] = original.r + (recolored.r - original.r) * weight;
    pixels[i + 1] = original.g + (recolored.g - original.g) * weight;
    pixels[i + 2] = original.b + (recolored.b - original.b) * weight;
  }

  ctx.putImageData(frame, 0, 0);
  return canvas;
}
