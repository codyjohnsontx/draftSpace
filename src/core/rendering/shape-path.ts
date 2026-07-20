import type { Bounds, ShapeType } from "@/core/elements/types";
import { roundedRectPath } from "@/lib/browser/rounded-rect-path";

export function shapePath(
  context: CanvasRenderingContext2D,
  type: ShapeType,
  bounds: Bounds,
  cornerRadius = 0,
): void {
  if (type === "rectangle") {
    roundedRectPath(context, bounds.x, bounds.y, bounds.width, bounds.height, cornerRadius);
    return;
  }

  context.beginPath();
  if (type === "ellipse") {
    context.ellipse(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width / 2,
      bounds.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    return;
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  context.moveTo(centerX, bounds.y);
  context.lineTo(bounds.x + bounds.width, centerY);
  context.lineTo(centerX, bounds.y + bounds.height);
  context.lineTo(bounds.x, centerY);
  context.closePath();
}
