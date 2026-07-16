import type { Point } from "@/core/elements/types";
import type { Viewport } from "@/core/board/types";

export const screenToWorld = (point: Point, viewport: Viewport): Point => ({
  x: (point.x - viewport.x) / viewport.zoom,
  y: (point.y - viewport.y) / viewport.zoom,
});

export const worldToScreen = (point: Point, viewport: Viewport): Point => ({
  x: point.x * viewport.zoom + viewport.x,
  y: point.y * viewport.zoom + viewport.y,
});

export function zoomAt(viewport: Viewport, screenPoint: Point, nextZoom: number): Viewport {
  const world = screenToWorld(screenPoint, viewport);
  const zoom = Math.min(8, Math.max(0.1, nextZoom));
  return { zoom, x: screenPoint.x - world.x * zoom, y: screenPoint.y - world.y * zoom };
}
