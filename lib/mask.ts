/**
 * The mask the user paints, as data instead of pixels.
 *
 * A mask is kept as **what the user did**, not as a bitmap: a selection made in
 * one gesture, plus the brush and eraser passes on top of it, in order. That is
 * the same reason `design_layers` keeps ratios and not pixels (migration 013):
 * the working image changes size along the pipeline, and a bitmap painted over
 * a 900px preview does not line up with a 1536px generation.
 *
 * The two halves are shaped differently because the gestures are:
 *
 *   - a **stroke** is a path, so it is stored in ratio space and resolved
 *     against whatever size is being rasterised;
 *   - the **selection** is a region with no path — `lib/garment-select.ts`
 *     works it out from the pixels — so it is stored as a full-frame coverage
 *     canvas. It is already in ratio space in the only sense that matters here:
 *     it covers exactly the working image, so scaling it to any size lands it
 *     on the same part of the garment.
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

/**
 * Everything the user has marked, in the order it gets composited.
 *
 * The selection goes down first and the strokes go on top, which is what makes
 * the pair useful rather than merely coexistent: the brush extends the
 * selection into what the fill missed, and the eraser takes back a sleeve
 * without the user having to choose which tool "owns" the mask.
 *
 * Selecting again replaces the base instead of adding to it. The fill is
 * deterministic — the same image and tolerance give the same region — so a
 * second selection that stacked would be a no-op pretending to be an action.
 *
 * Kept as one object because it is one thing. The recolour preview is tagged
 * with the exact mask that produced it and matched by identity at render
 * (APRENDIZAJES §5.14); with the halves apart, that tag would have to carry two
 * references and stay in step with both.
 */
export interface Mask {
  /** The garment picked in one gesture, or null while nothing was selected. */
  selection: HTMLCanvasElement | null;
  /** Brush and eraser passes, oldest first, applied over the selection. */
  strokes: MaskStroke[];
}

/**
 * Shared and frozen: a fresh `{ selection: null, strokes: [] }` on every clear
 * would be a new identity, and identity is what the preview tag compares.
 */
export const EMPTY_MASK: Mask = Object.freeze({
  selection: null,
  strokes: [],
});

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

/**
 * Whether there is anything to act on.
 *
 * A selection is enough on its own, and so is one brush stroke. It does not try
 * to work out whether the strokes happen to have erased the whole selection
 * again: that would mean rasterising to find out, on every render, to answer a
 * question the user can see for themselves on the canvas.
 */
export function isMaskEmpty(mask: Mask): boolean {
  if (mask.selection) return false;
  return !mask.strokes.some(
    (stroke) => !stroke.erase && stroke.points.length > 0
  );
}

interface RasterBase {
  mask: Mask;
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
 * The selection's coverage, scaled to the requested size and painted in one
 * colour.
 *
 * Two things happen here that both have to, and neither can be done by drawing
 * the shape straight onto the target. The **scale** is the whole reason the
 * selection can be stored once and used twice: the coverage canvas is the size
 * of the working image, the overlay is drawn at that size and the outgoing mask
 * at the snapped inference size, and `drawImage` resampling is what maps one
 * onto the other — including the feathered edge, which stays soft instead of
 * turning into stairs. The **tint** is what makes "white changes" true no
 * matter what the shape carried, and what lets the overlay be the accent.
 *
 * `source-in` keeps the destination's alpha and replaces its colour, so the
 * coverage survives and only the hue is imposed.
 */
function inked(
  selection: HTMLCanvasElement,
  width: number,
  height: number,
  color: string
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.drawImage(selection, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

/**
 * Draws the selection and then the strokes into a canvas of the requested size.
 *
 * Erasing uses `destination-out`, which is why the eraser is a stroke in the
 * same list rather than a separate structure: order matters, and replaying the
 * list in order is what makes "paint, erase a corner, paint again" come out the
 * way the user drew it.
 */
export function rasterizeMask(options: RasterOptions): HTMLCanvasElement {
  const { mask, width, height, mode } = options;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // The ink: white for a mask, the caller's accent for an overlay. Named once
  // because the selection and the strokes have to agree — a selection in one
  // colour and strokes in another would read as two different marks meaning two
  // different things.
  const ink = mode === "mask" ? MASK_EDIT : options.color;

  if (mode === "mask") {
    // Everything not painted is "keep". An overlay stays transparent instead,
    // so the garment shows through.
    ctx.fillStyle = MASK_KEEP;
    ctx.fillRect(0, 0, width, height);
  }

  // The base, before any stroke: the strokes composite over it, which is what
  // lets the eraser take a sleeve back out of an automatic selection.
  if (mask.selection) {
    ctx.drawImage(inked(mask.selection, width, height, ink), 0, 0);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of mask.strokes) {
    if (stroke.points.length === 0) continue;

    const lineWidth = stroke.width * width;

    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = ink;
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
