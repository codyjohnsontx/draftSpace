import type { BoardDocument } from "@/core/board/types";
import type { Connector, Point } from "@/core/elements/types";
import { connectorPolyline, type ElementPreview } from "./routing";

/** Screen distance within which a click takes an edge - the same tolerance the select tool grabs a shape with. */
export const CONNECTOR_HIT_PADDING = 6;

/** Shortest distance from a point to one segment of a route. */
function distanceToSegment(from: Point, to: Point, point: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** Shortest distance from a point to a polyline, not to the box its elbows sweep out. */
export function distanceToPolyline(points: readonly Point[], point: Point): number {
  if (!points.length) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let shortest = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceToSegment(points[index - 1], points[index], point);
    if (distance < shortest) shortest = distance;
  }
  return shortest;
}

/**
 * Which edge a click takes, topmost first. An edge is grabbed by the line that
 * is drawn rather than by the box around its elbows, so the space an elbow turns
 * around belongs to whatever is under it. The reach is a screen distance, and no
 * smaller than half the edge's own width, so a thick edge is never harder to hit
 * than the ink it puts down. A locked edge is left alone, as a locked element is
 * by selection, and one whose ends are gone or hidden draws nothing at all.
 */
export function hitTestConnectors(board: Pick<BoardDocument, "elements" | "connectorIds" | "connectors">, point: Point, zoom: number): Connector | null {
  for (let index = board.connectorIds.length - 1; index >= 0; index -= 1) {
    const connector = board.connectors[board.connectorIds[index]];
    if (!connector || connector.locked) continue;
    const points = connectorPolyline(board, connector);
    if (!points) continue;
    const reach = Math.max(CONNECTOR_HIT_PADDING / zoom, connector.strokeWidth / 2);
    if (distanceToPolyline(points, point) <= reach) return connector;
  }
  return null;
}

/**
 * The routed edges the selection is holding, dropping any the board no longer
 * draws. It reads the same gesture preview the canvas renders from, so the halo
 * and the edge under it can never disagree about where the edge is.
 */
export function selectedConnectorPolylines(board: Pick<BoardDocument, "elements" | "connectors">, connectorIds: readonly string[], preview?: ElementPreview | null): Array<{ id: string; points: Point[]; strokeWidth: number }> {
  return connectorIds.flatMap((id) => {
    const connector = board.connectors[id];
    const points = connector ? connectorPolyline(board, connector, preview) : null;
    return points ? [{ id, points, strokeWidth: connector!.strokeWidth }] : [];
  });
}
