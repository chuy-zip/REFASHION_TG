/**
 * The mask the user paints, as data instead of pixels.
 *
 * A mask is kept as a list of **strokes in ratio space**, not as a bitmap, for
 * the same reason `design_layers` keeps ratios and not pixels (migration 013):
 * the working image changes size along the pipeline, and a bitmap painted over
 * a 900px preview does not line up with a 1536px generation. Ratios do.
 *
 * From that list two different images get rasterised, and keeping one source
 * for both is the point of this file:
 *
 *   - the **overlay** the painter draws on the canvas, translucent, so the user
 *     sees where the strokes fall against the seams;
 *   - the **mask** that leaves for inference, strictly black and white, at the
 *     snapped size (`lib/generation/dimensions.ts`).
 *
 * Convention, identical for the generative and the deterministic path: **white
 * changes, black is kept, grey blends.** It is what Runware and fal both take,
 * and it is what `lib/recolor.ts` reads — so one painted mask drives both and
 * the user never learns there are two.
 */

/**
 * The two values of the mask protocol.
 *
 * These are **not design tokens and must never become them**, which is why they
 * live here as literals despite §5.1. They are wire format: Runware and fal
 * both define white as "regenerate this" and black as "preserve this". If the
 * palette changed tomorrow these would stay exactly the same, because they
 * describe what the provider reads, not what the user sees.
 */
const MASK_EDIT = "#FFFFFF";
const MASK_KEEP = "#000000";

/** A brush stroke: a run of points plus the width used to paint it. */
export interface MaskStroke {
  /** Ratios of the working image, 0..1, in the order they were painted. */
  points: { x: number; y: number }[];
  /** Brush diameter as a ratio of the image's **width**, so it scales with it. */
  width: number;
  /** An eraser is a stroke that removes instead of adding. */
  erase: boolean;
}

/** Brush sizes offered by the painter, as a ratio of the image width. */
export const BRUSH_SIZES = [0.03, 0.07, 0.14] as const;
export const DEFAULT_BRUSH = BRUSH_SIZES[1];

/**
 * Softness of the stroke edge, as a fraction of the brush width. A hard edge
 * leaves a visible seam where the recoloured region meets the rest of the
 * garment; the grey ramp is what the "grey blends" half of the convention is
 * for.
 */
const FEATHER = 0.18;

export function isMaskEmpty(strokes: MaskStroke[]): boolean {
  return !strokes.some((stroke) => !stroke.erase && stroke.points.length > 0);
}

interface RasterBase {
  strokes: MaskStroke[];
  width: number;
  height: number;
}

/**
 * Two outputs, and the type says which one you get.
 *
 * `"mask"` paints white on black — what inference and `recolorRegion` read.
 * `"overlay"` paints on transparent for the user to see, and **requires** its
 * colour: a default here would be a second copy of the accent living outside
 * `globals.css`, drifting the day the palette changes. The caller reads the
 * token; this file does not know what the app looks like.
 */
type RasterOptions =
  | (RasterBase & { mode: "mask" })
  | (RasterBase & { mode: "overlay"; color: string });

/**
 * Draws the strokes into a canvas of the requested size.
 *
 * Erasing uses `destination-out`, which is why the eraser is a stroke in the
 * same list rather than a separate structure: order matters, and replaying the
 * list in order is what makes "paint, erase a corner, paint again" come out the
 * way the user drew it.
 */
export function rasterizeMask(options: RasterOptions): HTMLCanvasElement {
  const { strokes, width, height, mode } = options;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (mode === "mask") {
    // Everything not painted is "keep". An overlay stays transparent instead,
    // so the garment shows through.
    ctx.fillStyle = MASK_KEEP;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;

    const lineWidth = stroke.width * width;

    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = mode === "mask" ? MASK_EDIT : options.color;
    ctx.lineWidth = lineWidth;

    // The soft edge comes from a blur on the brush rather than from a gradient
    // per point: it is one property instead of a second pass, and it keeps the
    // stroke's own overlaps from stacking into a hard core.
    ctx.filter = `blur(${(lineWidth * FEATHER) / 2}px)`;

    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    ctx.moveTo(first.x * width, first.y * height);

    if (rest.length === 0) {
      // A tap is a dot, not a zero-length line — `lineTo` to the same point
      // draws nothing in some browsers.
      ctx.lineTo(first.x * width + 0.01, first.y * height);
    } else {
      for (const point of rest) ctx.lineTo(point.x * width, point.y * height);
    }

    ctx.stroke();
  }

  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** The mask as a PNG, ready to be stored as an `asset_type = 'mask'`. */
export function maskToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/png")
  );
}
