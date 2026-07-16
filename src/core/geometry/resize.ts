import type { Bounds, CanvasElement, Point } from "@/core/elements/types";
import type { ResizeHandle } from "@/stores/session-store";

export function resizedBounds(initial: Bounds, handle: ResizeHandle, delta: Point, minSize = 16): Bounds {
  let left = initial.x, top = initial.y, right = initial.x + initial.width, bottom = initial.y + initial.height;
  if (handle.includes("w")) left = Math.min(right - minSize, left + delta.x);
  if (handle.includes("e")) right = Math.max(left + minSize, right + delta.x);
  if (handle.includes("n")) top = Math.min(bottom - minSize, top + delta.y);
  if (handle.includes("s")) bottom = Math.max(top + minSize, bottom + delta.y);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function scaleElements(elements: CanvasElement[], from: Bounds, to: Bounds): CanvasElement[] {
  const sx = to.width / Math.max(from.width, 1); const sy = to.height / Math.max(from.height, 1);
  return elements.map((e) => ({ ...e, x: to.x + (e.x - from.x) * sx, y: to.y + (e.y - from.y) * sy, width: Math.max(16, e.width * sx), height: Math.max(16, e.height * sy) }));
}
