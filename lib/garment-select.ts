/**
 * Selecting the whole garment in one gesture (Módulo 2).
 *
 * Painting a whole shirt with the brush is tedious, and freehand the colour
 * spills onto the background. This answers both, and it costs nothing: it is
 * **the machinery of `lib/background-removal.ts`, read backwards**.
 *
 * Taking the background off a logo and selecting a garment are the same
 * question — *which pixels are the object and which are the paper behind it* —
 * with the answer used in opposite directions: there what the fill reaches is
 * erased, here what it does **not** reach is kept. So this file does not
 * reimplement the flood fill; it calls it and keeps its alpha channel.
 *
 * Reusing instead of copying buys three things worth more than the lines saved:
 *
 *   - tolerance means the same in both modules, so what the user learnt while
 *     cutting a logo carries over;
 *   - the feathered edge (`featherEdges`) comes for free, and it is exactly the
 *     "grey blends" the mask protocol asks for — a hard edge leaves a visible
 *     seam where the recoloured garment meets the background;
 *   - what makes the fill defensible in the report — that only what is
 *     **reachable from the border** is removed, so the white inside a letter O
 *     survives — is the same rule that here keeps the gap between a collar and
 *     its lapel.
 *
 * Pure and synchronous like both its neighbours: it takes a loaded image and
 * gives back a canvas. No network, no React, no state. And the same CORS
 * caveat: `getImageData()` throws on a tainted canvas exactly like `toBlob()`
 * does, so callers catch (APRENDIZAJES §5.9b).
 */

import { removeBackground } from "./background-removal";

export interface GarmentSelection {
  /**
   * White where the garment is, transparent where the background is, at the
   * image's natural size. White and not the accent because it is what the mask
   * protocol reads — white changes, black is kept (`lib/mask.ts`). Whoever
   * paints it over the garment tints it.
   */
  shape: HTMLCanvasElement;
  /** Share of the bitmap that ended up selected, 0..1. */
  coveredShare: number;
}

/**
 * Under this the fill ate the garment: all four corners carried its colour,
 * nearly always because the image is cropped flush to it.
 */
const MIN_USEFUL_SHARE = 0.02;

/**
 * Over this it found no background to remove and selected the whole sheet. A
 * selection that includes the background is worse than none: applying a colour
 * then paints everything.
 */
const MAX_USEFUL_SHARE = 0.98;

/**
 * Whether the selection is worth anything.
 *
 * The threshold lives here because it is a property of the algorithm, not of
 * the screen; the message the user reads lives in the caller, because that one
 * really is an interface decision. And it is asked rather than assumed: a
 * useless selection applied in silence is the failure that only shows up at the
 * end.
 */
export function isUsefulSelection(coveredShare: number): boolean {
  return coveredShare > MIN_USEFUL_SHARE && coveredShare < MAX_USEFUL_SHARE;
}

/**
 * The garment as a shape, from the background the fill can reach.
 *
 * The canvas `removeBackground` returns is already the answer: transparent on
 * the background, opaque on the garment, with the feathered edge's partial
 * alpha in between. All that is left is to forget the colour and keep the
 * coverage, which is what this whitening does — a mask describes *where*, never
 * *what colour*.
 */
export function selectGarment(
  image: HTMLImageElement,
  tolerance: number
): GarmentSelection {
  const { canvas, removedShare } = removeBackground(image, tolerance);
  const { width, height } = canvas;
  if (width === 0 || height === 0) return { shape: canvas, coveredShare: 0 };

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context unavailable");

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
  }

  context.putImageData(imageData, 0, 0);

  return { shape: canvas, coveredShare: 1 - removedShare };
}
