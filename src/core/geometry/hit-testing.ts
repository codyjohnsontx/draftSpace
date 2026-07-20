import type { Bounds, CanvasElement, Point } from "@/core/elements/types";
import { containsBounds, containsPoint } from "./bounds";

export function shapeContainsPoint(element: CanvasElement, point: Point, padding: number): boolean {
  if (element.type === "rectangle") return containsPoint(element, point, padding);
  const radiusX = element.width / 2 + padding;
  const radiusY = element.height / 2 + padding;
  if (radiusX <= 0 || radiusY <= 0) return false;
  const normalizedX = Math.abs(point.x - (element.x + element.width / 2)) / radiusX;
  const normalizedY = Math.abs(point.y - (element.y + element.height / 2)) / radiusY;
  return element.type === "ellipse"
    ? normalizedX * normalizedX + normalizedY * normalizedY <= 1
    : normalizedX + normalizedY <= 1;
}

export function hitTestElements(elements: readonly CanvasElement[], point: Point, padding: number): CanvasElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!element.hidden && !element.locked && shapeContainsPoint(element, point, padding)) return element;
  }
  return null;
}

export function elementsContainedByBounds(elements: readonly CanvasElement[], bounds: Bounds): CanvasElement[] {
  const contained: CanvasElement[] = [];
  for (const element of elements) {
    if (!element.hidden && !element.locked && containsBounds(bounds, element)) contained.push(element);
  }
  return contained;
}
