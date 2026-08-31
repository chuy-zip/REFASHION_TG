"use client";

import { useMemo } from "react";
import { Image as KonvaImage, Layer } from "react-konva";
import { rasterizeMask, type Mask } from "@/lib/mask";

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
    return rasterizeMask({
      mask,
      width: naturalWidth,
      height: naturalHeight,
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
