"use client";

import { useEffect, useRef } from "react";
import { Circle, Layer } from "react-konva";
import type Konva from "konva";

interface BrushCursorProps {
  /** Brush diameter as a ratio of the image width, like the strokes it draws. */
  brush: number;
  /** Natural size of the working image; the stage draws in that space. */
  naturalWidth: number;
  /** An eraser takes paint away, and the ring says so before the gesture. */
  isEraser: boolean;
  /** Read from the design tokens by the workspace. */
  color: string;
}

/**
 * A ring the size of the brush, following the pointer.
 *
 * The missing affordance of the painter, and the one that makes the rest of it
 * legible: without it there is no way to know how wide the brush is until after
 * a stroke, and no way to tell a brush that is doing nothing from a brush that
 * is not working. Choosing a thickness from the rail was choosing a number.
 *
 * **It never re-renders React.** The position is written straight onto the
 * Konva node from a pointer listener, which is the same imperative escape the
 * Transformer already takes. Driving it from state would put a React render on
 * every pointer move over the canvas — the exact cost that made the mask
 * overlay unable to keep up, and it would be paid even when nobody is painting.
 *
 * Hidden until the pointer is actually over the stage, so it does not sit
 * stranded in a corner at 0,0 before the first move.
 */
export function BrushCursor({
  brush,
  naturalWidth,
  isEraser,
  color,
}: BrushCursorProps) {
  const ringRef = useRef<Konva.Circle>(null);

  useEffect(() => {
    const ring = ringRef.current;
    const stage = ring?.getStage();
    if (!ring || !stage) return;

    function move() {
      // Relative to the image, not to the screen: the stage is scaled to fit,
      // and everything on it is positioned in the garment's own pixel space.
      const point = stage!.getRelativePointerPosition();
      if (!point) return;
      ring!.position(point);
      ring!.visible(true);
    }

    function leave() {
      ring!.visible(false);
    }

    stage.on("pointermove", move);
    stage.on("pointerenter", move);
    stage.on("pointerleave", leave);

    return () => {
      stage.off("pointermove", move);
      stage.off("pointerenter", move);
      stage.off("pointerleave", leave);
    };
  }, []);

  return (
    // listening={false} or the ring would sit between the pointer and the
    // canvas it is describing, and every stroke would start on the cursor.
    <Layer listening={false}>
      <Circle
        ref={ringRef}
        visible={false}
        radius={(brush * naturalWidth) / 2}
        // Two rings, one dark and one light, so the outline stays visible over
        // a white garment and over a black one without knowing which it is.
        stroke={color}
        strokeWidth={Math.max(1, naturalWidth / 400)}
        dash={isEraser ? [naturalWidth / 60, naturalWidth / 60] : undefined}
        shadowColor={color}
        shadowBlur={naturalWidth / 300}
        opacity={0.9}
      />
    </Layer>
  );
}
