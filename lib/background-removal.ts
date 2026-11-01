/**
 * Taking the background off a logo, in the browser (Módulo 1, paso 4).
 *
 * This was chosen over an ONNX model in WASM and over a paid
 * background-removal endpoint, and the reasons still hold: the protocol defines
 * Módulo 1 as *composición clásica, NO generativo*, a flood fill can be
 * described and defended in the report while a downloaded model cannot, and it
 * costs nothing — no dependency, no megabytes, no price per call.
 *
 * Two steps, in this order:
 *
 *   1. If the logo already carries transparency there is nothing to remove and
 *      the tool is not offered. Most corporate logos arrive as cut-out PNGs.
 *   2. Otherwise, flood fill inward from the four corners with an adjustable
 *      tolerance. That covers the other common case, and the one that motivated
 *      the whole step: a JPEG on flat white.
 *
 * Everything here is pure and synchronous: it takes a loaded image and gives
 * back a canvas. No network, no React, no state — so it can be reasoned about
 * (and eventually tested) entirely on its own.
 *
 * **Reading pixels needs the same CORS cleanliness the export needs.**
 * `getImageData()` throws a SecurityError on a tainted canvas, exactly like
 * `toBlob()` does. The images arrive from `useCrossOriginImage`, which sets
 * `crossOrigin`, so this is covered — but callers still catch, because the
 * failure mode is the one that only shows up at the end.
 */

/** Largest possible distance between two colours in RGB: √(3·255²). */
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * Under this, a pixel counts as see-through. Not 255: exporters routinely leave
 * 254 on antialiased edges, and a logo whose border is "almost opaque" is not a
 * cut-out one.
 */
const OPAQUE_ALPHA = 250;

/** How much of the border ring must be transparent to call a logo cut out. */
const TRANSPARENT_BORDER_SHARE = 0.95;

/**
 * How far past the tolerance the feathering ramp reaches. Antialiasing and JPEG
 * ringing produce a one-pixel halo whose colour sits just outside the match;
 * this is what fades it instead of leaving a grey outline.
 */
const FEATHER_REACH = 1.75;

/** Middle of the useful range: clears flat white without eating dark strokes. */
export const DEFAULT_TOLERANCE = 0.12;

/** Past this the fill stops being a cut-out and starts eating the logo. */
export const MAX_TOLERANCE = 0.4;

export interface BackgroundRemoval {
  canvas: HTMLCanvasElement;
  /** Share of the bitmap that ended up transparent, 0..1. */
  removedShare: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function drawToCanvas(image: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context unavailable");

  context.drawImage(image, 0, 0);
  return { canvas, context };
}

/**
 * Whether the logo is already cut out.
 *
 * Reads **only the border ring**, and that is the point: whether there is a
 * background to remove is a property of the edges. Scanning the whole bitmap
 * would answer a different question, and a soft shadow inside an otherwise
 * opaque logo would pass for transparency.
 *
 * Being RGBA is not evidence either — a PNG can carry an alpha channel that is
 * 255 everywhere. This tests values, not the format.
 */
export function hasTransparentBackground(image: HTMLImageElement): boolean {
  const { canvas, context } = drawToCanvas(image);
  const { width, height } = canvas;
  if (width === 0 || height === 0) return false;

  const ring = [
    context.getImageData(0, 0, width, 1),
    context.getImageData(0, height - 1, width, 1),
    context.getImageData(0, 0, 1, height),
    context.getImageData(width - 1, 0, 1, height),
  ];

  let total = 0;
  let transparent = 0;

  for (const strip of ring) {
    for (let offset = 3; offset < strip.data.length; offset += 4) {
      total += 1;
      if (strip.data[offset] < OPAQUE_ALPHA) transparent += 1;
    }
  }

  return total > 0 && transparent / total >= TRANSPARENT_BORDER_SHARE;
}

/**
 * The four corner colours, de-duplicated.
 *
 * All four are seeds and a pixel matches if it is close to **any** of them.
 * That handles a background that is not perfectly uniform (a scan, a slight
 * vignette) while keeping the rule short enough to state in one sentence, which
 * matters more here than squeezing out the last few pixels.
 */
function cornerColors(data: Uint8ClampedArray, width: number, height: number): Rgb[] {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const seeds: Rgb[] = [];

  for (const index of corners) {
    const offset = index * 4;
    const seed = {
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
    };
    const known = seeds.some(
      (other) => other.r === seed.r && other.g === seed.g && other.b === seed.b
    );
    if (!known) seeds.push(seed);
  }

  return seeds;
}

/** Squared on purpose: comparing against a squared threshold skips the sqrt. */
function nearestSeedDistanceSquared(
  data: Uint8ClampedArray,
  offset: number,
  seeds: Rgb[]
): number {
  let nearest = Infinity;

  for (const seed of seeds) {
    const dr = data[offset] - seed.r;
    const dg = data[offset + 1] - seed.g;
    const db = data[offset + 2] - seed.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

/**
 * Fades the one-pixel halo left along the cut.
 *
 * A hard threshold leaves the antialiased ring around letters at full opacity,
 * which reads as a grey outline once the logo sits on a coloured garment. Every
 * kept pixel that touches a removed one failed the match by definition, so its
 * distance is past the tolerance; the ones that failed *narrowly* get partial
 * alpha instead of full.
 */
function featherEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  removed: Uint8Array,
  seeds: Rgb[],
  threshold: number
): void {
  if (threshold <= 0) return;

  const reach = threshold * FEATHER_REACH;
  const ramp = reach - threshold;

  for (let index = 0; index < removed.length; index += 1) {
    if (removed[index]) continue;

    const x = index % width;
    const y = (index - x) / width;

    const touchesBackground =
      (x > 0 && removed[index - 1] === 1) ||
      (x < width - 1 && removed[index + 1] === 1) ||
      (y > 0 && removed[index - width] === 1) ||
      (y < height - 1 && removed[index + width] === 1);

    if (!touchesBackground) continue;

    const offset = index * 4;
    const distance = Math.sqrt(
      nearestSeedDistanceSquared(data, offset, seeds)
    );
    if (distance >= reach) continue;

    const alpha = Math.max(0, Math.round((255 * (distance - threshold)) / ramp));
    if (alpha < data[offset + 3]) data[offset + 3] = alpha;
  }
}

/**
 * Flood fill from the four corners, 4-connected, with an adjustable tolerance.
 *
 * Only what is **reachable from an edge** is removed, which is the whole reason
 * to use a fill instead of "delete every white pixel": the white inside a letter
 * O, or a white stripe in the middle of the mark, is enclosed by the logo and
 * survives. That distinction is what makes this defensible as computer vision
 * rather than a colour filter.
 */
export function removeBackground(
  image: HTMLImageElement,
  tolerance: number
): BackgroundRemoval {
  const { canvas, context } = drawToCanvas(image);
  const { width, height } = canvas;
  const pixelCount = width * height;
  if (pixelCount === 0) return { canvas, removedShare: 0 };

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  const seeds = cornerColors(data, width, height);
  const threshold = tolerance * MAX_COLOR_DISTANCE;
  const thresholdSquared = threshold * threshold;

  const removed = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const pending: number[] = [];

  const consider = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;

    const offset = index * 4;
    // Already see-through counts as background: a logo can arrive with part of
    // it cut out and a white box around the rest.
    const isBackground =
      data[offset + 3] < OPAQUE_ALPHA ||
      nearestSeedDistanceSquared(data, offset, seeds) <= thresholdSquared;

    if (!isBackground) return;

    removed[index] = 1;
    pending.push(index);
  };

  consider(0);
  consider(width - 1);
  consider((height - 1) * width);
  consider(pixelCount - 1);

  // Iterative on purpose: a recursive flood fill blows the call stack on
  // anything larger than a thumbnail, and logos are not thumbnails.
  while (pending.length > 0) {
    const index = pending.pop();
    if (index === undefined) break;

    const x = index % width;
    const y = (index - x) / width;

    if (x > 0) consider(index - 1);
    if (x < width - 1) consider(index + 1);
    if (y > 0) consider(index - width);
    if (y < height - 1) consider(index + width);
  }

  let removedCount = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (removed[index] === 1) {
      data[index * 4 + 3] = 0;
      removedCount += 1;
    }
  }

  featherEdges(data, width, height, removed, seeds, threshold);

  context.putImageData(imageData, 0, 0);

  return { canvas, removedShare: removedCount / pixelCount };
}

/**
 * PNG always: the point of the whole operation is the alpha channel, and JPEG
 * cannot carry one. Saving the result as JPEG would silently reinstate the
 * background it just removed.
 */
export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
