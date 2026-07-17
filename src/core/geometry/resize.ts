import type { Bounds, CanvasElement, Point } from "@/core/elements/types";
import type { ResizeHandle } from "@/stores/session-store";

export type ResizeOptions = { minSize?: number; preserveAspect?: boolean; fromCenter?: boolean };

export function resizedBounds(initial: Bounds, handle: ResizeHandle, delta: Point, options: ResizeOptions | number = {}): Bounds {
  const resolved = typeof options === "number" ? { minSize: options } : options;
  const minSize = resolved.minSize ?? 16;
  const horizontal = handle.includes("w") || handle.includes("e");
  const vertical = handle.includes("n") || handle.includes("s");
  const factor = resolved.fromCenter ? 2 : 1;
  let width = horizontal ? initial.width + (handle.includes("w") ? -delta.x : delta.x) * factor : initial.width;
  let height = vertical ? initial.height + (handle.includes("n") ? -delta.y : delta.y) * factor : initial.height;
  width = Math.max(minSize, width); height = Math.max(minSize, height);

  if (resolved.preserveAspect) {
    const aspect = initial.width / Math.max(initial.height, 1);
    if (horizontal && !vertical) height = Math.max(minSize, width / aspect);
    else if (vertical && !horizontal) width = Math.max(minSize, height * aspect);
    else if (Math.abs(width / initial.width - 1) >= Math.abs(height / initial.height - 1)) height = Math.max(minSize, width / aspect);
    else width = Math.max(minSize, height * aspect);
  }

  const centerX = initial.x + initial.width / 2; const centerY = initial.y + initial.height / 2;
  let x = initial.x; let y = initial.y;
  if (resolved.fromCenter || (resolved.preserveAspect && !horizontal)) x = centerX - width / 2;
  else if (handle.includes("w")) x = initial.x + initial.width - width;
  if (resolved.fromCenter || (resolved.preserveAspect && !vertical)) y = centerY - height / 2;
  else if (handle.includes("n")) y = initial.y + initial.height - height;
  return { x, y, width, height };
}

export function scaleElements(elements: CanvasElement[], from: Bounds, to: Bounds): CanvasElement[] {
  const sx = to.width / Math.max(from.width, 1); const sy = to.height / Math.max(from.height, 1);
  return elements.map((e) => ({ ...e, x: to.x + (e.x - from.x) * sx, y: to.y + (e.y - from.y) * sy, width: Math.max(16, e.width * sx), height: Math.max(16, e.height * sy) }));
}
