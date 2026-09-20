/**
 * The size an image has to become before it can be sent for inference.
 *
 * FLUX.1 Fill [dev] (`runware:102@1`) takes `width` and `height` between 128
 * and 2048, **in increments of 64**. A catalogue photo is never a multiple of
 * 64 by accident, so every request has to snap first — and the mask has to be
 * exported at exactly the same snapped size, or the two do not line up and the
 * edit lands somewhere else.
 *
 * That is why this lives in its own file and not inside the provider: the mask
 * painter in the browser needs the same answer the server does, and two
 * implementations of "what size will this be" is precisely how a mask ends up
 * one pixel off.
 */

export const INFERENCE_STEP = 64;
export const INFERENCE_MIN = 128;
export const INFERENCE_MAX = 2048;

/**
 * What the canvas aims for when the source allows it, in pixels.
 *
 * Measured, not chosen. The experiments in `herramientas/` ran the same edit at
 * three scales on the same photo: 0.32 MP left visible artefacts, **1.20 MP
 * came back clean**, and pushing a 0.32 MP source up to 1.26 MP made the model
 * hand the input back almost unchanged. So the target is the middle one, and
 * the no-upscaling rule below keeps the third case from happening.
 *
 * See `herramientas/docs/EXPERIMENTO_2_plan.md` and `EXPERIMENTO_3_*.md`.
 */
const TARGET_PIXELS = 1_200_000;

/**
 * How much bigger than the original the canvas may get, counted in pixels.
 *
 * A hard "never enlarge" rule sounds safe and is not. The 64 grid is coarse, so
 * for some proportions the only faithful size below the original is far below
 * it: a 731×419 garment has just one near-exact match under its own pixel count
 * and it is 448×256, which throws away **63% of the pixels** to gain four
 * points of aspect accuracy. Losing that much resolution is also a loss of
 * quality, and 0.32 MP was already the range where artefacts showed up.
 *
 * Doubling the pixel count is 1.41× on each side: a resample any photo editor
 * would do without comment, not the kind of enlargement that invents detail.
 * The cap is what keeps a thumbnail from being blown up into a fake megapixel.
 */
const UPSCALE_BUDGET = 2;

/**
 * Aspect drift nobody can see, so resolution gets to decide instead.
 *
 * 9.9% was plainly visible in the output and cost real time to diagnose. 1% on
 * a 1000px side is ten pixels across the whole garment. Treating everything
 * under this as equally good is what stops the search from trading away most of
 * the image to chase a third decimal place.
 */
const INVISIBLE_DRIFT = 0.01;

export interface Size {
  width: number;
  height: number;
}

/** How far `candidate` strays from `source`'s proportions, as a fraction. */
export function aspectDrift(source: Size, candidate: Size): number {
  const wanted = source.height / source.width;
  return Math.abs(candidate.height / candidate.width - wanted) / wanted;
}

/**
 * Fits a source size onto the valid grid **without distorting the garment**.
 *
 * The obvious implementation — scale both sides by one factor, then round each
 * to the nearest multiple of 64 — is what this file used to do, and it is
 * wrong in a way that only shows up in the output. Rounding happens per side,
 * so the two sides move independently and the ratio shifts: a real 731×419
 * garment became 704×448, a **9.9% change in aspect**. The prints came back
 * subtly stretched and it read as the model's fault, which cost real time to
 * diagnose.
 *
 * So instead of computing one size, this searches every legal pair and keeps
 * the one whose proportions are closest to the original, breaking ties by
 * whichever lands nearest `TARGET_PIXELS`. The grid is 31×31, so an exhaustive
 * search is cheaper than the arithmetic it replaces.
 *
 * Proportion comes first, but only until it stops being visible: every
 * candidate under `INVISIBLE_DRIFT` counts as equally faithful, and among those
 * the one nearest `TARGET_PIXELS` wins. Without that second half the search
 * chases decimal places and hands back a thumbnail.
 *
 * On the same 731×419 that used to drift 9.9%, this drifts 0.31% and keeps more
 * pixels than the original had. On a 2:3 photo it drifts by zero.
 */
export function snapToInferenceSize(source: Size): Size {
  const ceiling = source.width * source.height * UPSCALE_BUDGET;
  const target = Math.min(TARGET_PIXELS, ceiling);

  let best: Size = { width: INFERENCE_MIN, height: INFERENCE_MIN };
  let bestDrift = Infinity;
  let bestDistance = Infinity;

  for (let width = INFERENCE_MIN; width <= INFERENCE_MAX; width += INFERENCE_STEP) {
    for (let height = INFERENCE_MIN; height <= INFERENCE_MAX; height += INFERENCE_STEP) {
      const pixels = width * height;
      if (pixels > ceiling) continue;

      const candidate = { width, height };
      const drift = aspectDrift(source, candidate);
      const distance = Math.abs(pixels - target);

      // Anything already invisible is treated as a tie, so the comparison that
      // decides is resolution. Above that threshold, drift still rules.
      const a = Math.max(drift, INVISIBLE_DRIFT);
      const b = Math.max(bestDrift, INVISIBLE_DRIFT);
      const better = a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && distance < bestDistance);

      if (better) {
        best = candidate;
        bestDrift = drift;
        bestDistance = distance;
      }
    }
  }

  return best;
}

/** True when a size can be sent as-is. */
export function isInferenceSize(size: Size): boolean {
  const ok = (v: number) =>
    Number.isInteger(v) &&
    v >= INFERENCE_MIN &&
    v <= INFERENCE_MAX &&
    v % INFERENCE_STEP === 0;

  return ok(size.width) && ok(size.height);
}

/**
 * The only sizes FLUX.1 Kontext accepts, and it is a closed list.
 *
 * **This is not "multiples of 64" like Fill.** The first call ever made to that
 * model was rejected with `unsupportedDimensions`, and the rejection itself
 * returned the permitted list, which is what is written here. The call cost
 * nothing, because a rejected task is not charged, but it cost a round trip,
 * and this list is what stops the next one from paying it again
 * (`herramientas/probar_kontext.py`).
 *
 * Every entry is about 1 MP, which is where the model is trained.
 */
export const KONTEXT_SIZES: Size[] = [
  { width: 1568, height: 672 },
  { width: 1504, height: 688 },
  { width: 1456, height: 720 },
  { width: 1392, height: 752 },
  { width: 1328, height: 800 },
  { width: 1248, height: 832 },
  { width: 1184, height: 880 },
  { width: 1104, height: 944 },
  { width: 1024, height: 1024 },
  { width: 944, height: 1104 },
  { width: 880, height: 1184 },
  { width: 832, height: 1248 },
  { width: 800, height: 1328 },
  { width: 752, height: 1392 },
  { width: 720, height: 1456 },
  { width: 688, height: 1504 },
  { width: 672, height: 1568 },
];

/**
 * The allowed size that distorts the source proportion least.
 *
 * Only the ratio is chosen here, never the pixel count: every entry is around
 * 1 MP, so there is no budget to trade off the way `snapToInferenceSize` does.
 * That makes this the simpler of the two, and the one place where a caller
 * could get it wrong is by assuming the two functions are interchangeable.
 *
 * Distortion is not always avoidable. A 2:3 photograph lands on 832×1248, which
 * is exactly 1.5 and therefore free; a squarer one does not, and the drift is
 * real and has to be accepted rather than hidden.
 */
export function snapToKontextSize(source: Size): Size {
  let best = KONTEXT_SIZES[0];
  let bestDrift = Infinity;

  for (const candidate of KONTEXT_SIZES) {
    const drift = aspectDrift(source, candidate);
    if (drift < bestDrift) {
      best = candidate;
      bestDrift = drift;
    }
  }

  return best;
}
