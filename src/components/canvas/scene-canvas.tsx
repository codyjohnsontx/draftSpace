"use client";

import { useEffect, useRef } from "react";
import type { BoardDocument, Viewport } from "@/core/board/types";
import type { CanvasElement, Connector } from "@/core/elements/types";
import type { ElementPreview } from "@/core/connectors/routing";
import { intersectsBounds, worldViewportBounds } from "@/core/geometry/visibility";
import { renderScene, type ShapeDraft } from "@/core/rendering/render-scene";
import { finishPendingInteraction, measurePerformance } from "@/features/performance/performance-monitor";

type Props = {
  board: BoardDocument; viewport: Viewport; elements: CanvasElement[];
  /** The edges to draw when a style is being previewed; the board's own otherwise. */
  connectors?: readonly Connector[];
  /** The boxes a gesture is drawing its elements at, so a bound edge follows the drag. */
  elementPreview?: ElementPreview | null;
  width: number; height: number; draftShape: ShapeDraft | null;
};

export function SceneCanvas({ board, viewport, elements, connectors, elementPreview = null, width, height, draftShape }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const visibleBounds = worldViewportBounds(viewport, { width, height });
    const visibleElementCount = elements.reduce((count, element) => count + Number(!element.hidden && intersectsBounds(element, visibleBounds)), 0);
    measurePerformance("scene-render", elements.length, () => renderScene({ context, board, viewport, elements, connectors, elementPreview, canvasSize: { width, height }, draftShape }), visibleElementCount);
    finishPendingInteraction();
  }, [board, connectors, dpr, draftShape, elementPreview, elements, height, viewport, width]);

  return <canvas data-testid="scene-canvas" ref={ref} className="scene-canvas" aria-hidden="true" width={Math.max(1, Math.floor(width * dpr))} height={Math.max(1, Math.floor(height * dpr))} />;
}
