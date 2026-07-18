import type { Viewport } from "@/core/board/types";
import type { Bounds } from "@/core/elements/types";

export function worldViewportBounds(viewport: Viewport, canvasSize: { width: number; height: number }, overscanPx = 0): Bounds {
  const overscan = overscanPx / viewport.zoom;
  return {
    x: -viewport.x / viewport.zoom - overscan,
    y: -viewport.y / viewport.zoom - overscan,
    width: canvasSize.width / viewport.zoom + overscan * 2,
    height: canvasSize.height / viewport.zoom + overscan * 2,
  };
}

export function intersectsBounds(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}
