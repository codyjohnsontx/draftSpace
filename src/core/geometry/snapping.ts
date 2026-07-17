import type { Bounds, Point } from "@/core/elements/types";

export const snapValue = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

export function snapBoundsToGrid(bounds: Bounds, gridSize: number): Bounds {
  return {
    x: snapValue(bounds.x, gridSize),
    y: snapValue(bounds.y, gridSize),
    width: Math.max(16, snapValue(bounds.width, gridSize)),
    height: Math.max(16, snapValue(bounds.height, gridSize)),
  };
}

export function snappedMoveDelta(origin: Point, delta: Point, gridSize: number): Point {
  return { x: snapValue(origin.x + delta.x, gridSize) - origin.x, y: snapValue(origin.y + delta.y, gridSize) - origin.y };
}
