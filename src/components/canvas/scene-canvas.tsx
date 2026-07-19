"use client";

import { useEffect, useRef } from "react";
import type { BoardDocument, Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement } from "@/core/elements/types";
import { intersectsBounds, worldViewportBounds } from "@/core/geometry/visibility";
import { renderScene } from "@/core/rendering/render-scene";
import { finishPendingInteraction, measurePerformance } from "@/features/performance/performance-monitor";

type Props = { board: BoardDocument; viewport: Viewport; elements: CanvasElement[]; width: number; height: number; draftRectangle: Bounds | null };

export function SceneCanvas({ board, viewport, elements, width, height, draftRectangle }: Props) {
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
    measurePerformance("scene-render", elements.length, () => renderScene({ context, board, viewport, elements, canvasSize: { width, height }, draftRectangle }), visibleElementCount);
    finishPendingInteraction();
  }, [board, dpr, draftRectangle, elements, height, viewport, width]);

  return <canvas data-testid="scene-canvas" ref={ref} className="scene-canvas" aria-hidden="true" width={Math.max(1, Math.floor(width * dpr))} height={Math.max(1, Math.floor(height * dpr))} />;
}
