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
 * does, so callers catch.
 */

import { DEFAULT_TOLERANCE, removeBackground } from "./background-removal";

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
  /**
   * How far apart the background and the garment actually are, in RGB
   * distance. This is the number that says whether the fill had anything to go
   * on — see `isUsefulSelection`.
   */
  contrast: number;
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
 * Largest possible distance between two colours in RGB, repeated here from
 * `background-removal.ts` so the tolerance can be read in the same units.
 */
const MAX_COLOR_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * Whether the selection is worth anything.
 *
 * Two questions, and the second was learned the hard way.
 *
 * **How much it covered** catches the degenerate cases: almost nothing means
 * the fill ate the garment, almost everything means it found no background.
 *
 * **How much contrast there was** catches the case that slips between them, and
 * it is the common one: a **white shirt on a white background**. The fill walks
 * outward while the colour difference stays under the tolerance, and a lit
 * white garment (≈250,250,250) is under nine units away from a white backdrop —
 * against a tolerance of about fifty-three. So it walks straight into the
 * garment and only stops at folds dark enough to exceed the threshold, leaving
 * ragged streaks that follow the shading.
 *
 * **This is not a calibration problem.** The tolerance low enough to tell the
 * shirt from the backdrop is too low to remove the backdrop at all. The honest
 * answer is to detect the case and say so, which is what this does: a coverage
 * in a plausible range hid it completely, and a bad selection applied in
 * silence is the failure that only shows up at the end.
 *
 * It matters more than it looks: a white shirt is probably the most common
 * garment in corporate uniforms.
 */
export function isUsefulSelection(selection: GarmentSelection): boolean {
  const { coveredShare, contrast } = selection;

  if (coveredShare <= MIN_USEFUL_SHARE || coveredShare >= MAX_USEFUL_SHARE) {
    return false;
  }

  // Misma escala que la tolerancia: si el fondo y la prenda están más cerca
  // entre sí que el margen con el que se decide "esto es fondo", el relleno no
  // tenía con qué distinguirlos.
  return contrast > DEFAULT_TOLERANCE * MAX_COLOR_DISTANCE;
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
  if (width === 0 || height === 0)
    return { shape: canvas, coveredShare: 0, contrast: 0 };

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context unavailable");

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  // El contraste se mide ANTES de blanquear, y se puede medir porque
  // `removeBackground` pone el alfa en cero pero **no toca el RGB**: los
  // píxeles quitados siguen llevando el color del fondo y los conservados el de
  // la prenda. Los dos promedios están en los mismos bytes que hay que recorrer
  // igual para blanquear.
  let fondoR = 0, fondoG = 0, fondoB = 0, fondoN = 0;
  let prendaR = 0, prendaG = 0, prendaB = 0, prendaN = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 8) {
      fondoR += data[offset];
      fondoG += data[offset + 1];
      fondoB += data[offset + 2];
      fondoN += 1;
    } else {
      prendaR += data[offset];
      prendaG += data[offset + 1];
      prendaB += data[offset + 2];
      prendaN += 1;
    }

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
  }

  context.putImageData(imageData, 0, 0);

  const contrast =
    fondoN > 0 && prendaN > 0
      ? Math.hypot(
          fondoR / fondoN - prendaR / prendaN,
          fondoG / fondoN - prendaG / prendaN,
          fondoB / fondoN - prendaB / prendaN
        )
      : 0;

  return { shape: canvas, coveredShare: 1 - removedShare, contrast };
}
