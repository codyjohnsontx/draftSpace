import type { Bounds, CanvasElement, Point } from "@/core/elements/types";

export function normalizeBounds(a: Point, b: Point): Bounds {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

export function creationBounds(origin: Point, pointer: Point, square = false, fromCenter = false): Bounds {
  let dx = pointer.x - origin.x; let dy = pointer.y - origin.y;
  if (square) { const size = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * size; dy = Math.sign(dy || 1) * size; }
  if (fromCenter) return normalizeBounds({ x: origin.x - dx, y: origin.y - dy }, { x: origin.x + dx, y: origin.y + dy });
  return normalizeBounds(origin, { x: origin.x + dx, y: origin.y + dy });
}

export const containsPoint = (bounds: Bounds, point: Point, padding = 0) =>
  point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding &&
  point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;

export const containsBounds = (outer: Bounds, inner: Bounds) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

export function selectionBounds(elements: CanvasElement[]): Bounds | null {
  if (!elements.length) return null;
  const left = Math.min(...elements.map((e) => e.x));
  const top = Math.min(...elements.map((e) => e.y));
  const right = Math.max(...elements.map((e) => e.x + e.width));
  const bottom = Math.max(...elements.map((e) => e.y + e.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
