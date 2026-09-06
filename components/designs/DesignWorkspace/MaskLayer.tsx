"use client";

import { useMemo } from "react";
import { Image as KonvaImage, Layer } from "react-konva";
import { rasterizeMask, type Mask } from "@/lib/mask";

/**
 * Longest side the overlay is rasterised at, whatever the garment's real size.
 *
 * This is a translucent preview stretched over the stage, not the mask that
 * leaves for inference — that one is still built at full resolution, from the
 * same gestures, in `handleGenerate`. Painting it at four megapixels bought
 * nothing anybody could see and cost the thing that matters most here: it has
 * to be redrawn on every pointer move, and at full size it could not keep up.
 * The strokes were in state the whole time; they simply never got drawn.
 */
const OVERLAY_MAX_SIDE = 900;

interface MaskLayerProps {
  mask: Mask;
  /** Natural size of the working image; ratios are resolved against it. */
  naturalWidth: number;
  naturalHeight: number;
  /** Accent, read from the design tokens by the workspace. */
  color: string;
}

/**
 * The painted mask, drawn over the garment.
 *
 * Konva-only: it renders no DOM, so it has no stylesheet of its own — same
 * shape as `LayerNode`, and the reason it lives beside the workspace instead of
 * in `components/designs/`.
 *
 * **One image, not one shape per stroke.** The first version drew a Konva
 * `Line` per stroke with the layer at 40% opacity, and that was wrong twice
 * over: Konva multiplies a container's opacity into each child, so two strokes
 * crossing each other composited twice and the overlap showed up as a darker
 * patch — the user painting saw their own passes. Rasterising the whole mask
 * into a single canvas and drawing *that* at 40% composites once, so an overlap
 * looks exactly like a single pass, which is what a brush does.
 *
 * **Small on purpose.** It is rasterised at `OVERLAY_MAX_SIDE` and stretched,
 * because it is redrawn on every pointer move and at the garment's real size it
 * could not keep up — which is not a theoretical cost: it is what made brush
 * strokes fail to appear while they were being painted, on a mask that had
 * recorded them correctly all along. What leaves for inference is still built
 * at full resolution.
 *
 * The second reason matters more: this uses **the same `rasterizeMask` that
 * builds the mask sent for inference**. What the user sees and what the model
 * receives are now the same pixels, including the feathered edge — and, since
 * the automatic selection goes through that same function, including the shape
 * the flood fill found. Two implementations of "where did they paint" is how a
 * mask ends up meaning one thing on screen and another in the request.
 */
export function MaskLayer({
  mask,
  naturalWidth,
  naturalHeight,
  color,
}: MaskLayerProps) {
  const overlay = useMemo(() => {
    if (naturalWidth === 0 || naturalHeight === 0) return null;

    // Never upscale: a small garment is already cheap, and stretching its
    // overlay would only blur the edge the user is trying to judge.
    const scale = Math.min(
      1,
      OVERLAY_MAX_SIDE / Math.max(naturalWidth, naturalHeight)
    );

    return rasterizeMask({
      mask,
      width: Math.max(1, Math.round(naturalWidth * scale)),
      height: Math.max(1, Math.round(naturalHeight * scale)),
      mode: "overlay",
      color,
    });
  }, [mask, naturalWidth, naturalHeight, color]);

  if (!overlay) return null;

  return (
    <Layer listening={false} opacity={0.45}>
      <KonvaImage image={overlay} width={naturalWidth} height={naturalHeight} />
    </Layer>
  );
}
