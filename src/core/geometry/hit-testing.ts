import type { Bounds, CanvasElement, Point } from "@/core/elements/types";
import { containsBounds, containsPoint } from "./bounds";

export function hitTestElements(elements: readonly CanvasElement[], point: Point, padding: number): CanvasElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!element.hidden && !element.locked && containsPoint(element, point, padding)) return element;
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
