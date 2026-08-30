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

export interface Size {
  width: number;
  height: number;
}

function snapSide(value: number): number {
  const snapped = Math.round(value / INFERENCE_STEP) * INFERENCE_STEP;
  return Math.min(INFERENCE_MAX, Math.max(INFERENCE_MIN, snapped));
}

/**
 * Fits a source size into the valid grid, keeping the aspect ratio as close as
 * the grid allows.
 *
 * Scaling comes first and rounding second, on purpose: rounding a 3000px side
 * down to 2048 directly would squash one axis while the other kept its scale.
 * Scaling both by the same factor and rounding afterwards keeps the garment's
 * proportions, and the residual error is at most half a step on each side.
 *
 * Nothing is ever scaled **up**: enlarging a small photo before inference
 * invents detail the model then treats as real, and it costs more compute for
 * a worse result.
 */
export function snapToInferenceSize(source: Size): Size {
  const largest = Math.max(source.width, source.height);
  const scale = largest > INFERENCE_MAX ? INFERENCE_MAX / largest : 1;

  return {
    width: snapSide(source.width * scale),
    height: snapSide(source.height * scale),
  };
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
