import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement, Connector, Point, PortSide } from "@/core/elements/types";
import { portDirection, portPoint, resolveConnectorPorts } from "./ports";

/** How far a connector travels perpendicular to a shape before it may bend. */
export const PORT_STUB = 24;

/** Connector IDs whose endpoints reference any of the given (typically deleted) element IDs. */
export function connectorsTouching(board: Pick<BoardDocument, "connectorIds" | "connectors">, elementIds: Set<string>): string[] {
  return board.connectorIds.filter((id) => {
    const connector = board.connectors[id];
    return connector && (elementIds.has(connector.from.elementId) || elementIds.has(connector.to.elementId));
  });
}

const isHorizontal = (side: PortSide) => side === "e" || side === "w";

const shift = (point: Point, side: PortSide, distance: number): Point => {
  const direction = portDirection(side);
  return { x: point.x + direction.x * distance, y: point.y + direction.y * distance };
};

/** Drops repeated and collinear intermediate points from an orthogonal polyline. */
function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) continue;
    result.push(point);
    while (result.length >= 3) {
      const [a, b, c] = result.slice(-3);
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!collinear) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

/**
 * Routes a connector as an orthogonal elbow polyline in board coordinates:
 * port anchor, perpendicular stub, at most three axis-aligned bends, stub,
 * port anchor. Pure geometry — both the 2D canvas and the 3D space render
 * exactly this polyline, so the views cannot drift.
 */
export function routeConnector(fromBounds: { x: number; y: number; width: number; height: number }, toBounds: { x: number; y: number; width: number; height: number }, connector: Pick<Connector, "from" | "to">): Point[] {
  const { fromPort, toPort } = resolveConnectorPorts(fromBounds, toBounds, connector);
  const start = portPoint(fromBounds, fromPort);
  const end = portPoint(toBounds, toPort);
  const exit = shift(start, fromPort, PORT_STUB);
  const entry = shift(end, toPort, PORT_STUB);

  let middle: Point[];
  if (isHorizontal(fromPort) && isHorizontal(toPort)) {
    const midX = (exit.x + entry.x) / 2;
    middle = [{ x: midX, y: exit.y }, { x: midX, y: entry.y }];
  } else if (!isHorizontal(fromPort) && !isHorizontal(toPort)) {
    const midY = (exit.y + entry.y) / 2;
    middle = [{ x: exit.x, y: midY }, { x: entry.x, y: midY }];
  } else if (isHorizontal(fromPort)) {
    middle = [{ x: entry.x, y: exit.y }];
  } else {
    middle = [{ x: exit.x, y: entry.y }];
  }

  return simplify([start, exit, ...middle, entry, end]);
}

/**
 * The point half way along a routed edge by length, and whether the run it
 * lands on is horizontal. A label is set there rather than on a bend, so it
 * stays clear of both objects the edge joins - a two-point route's middle
 * vertex is its arrowhead, which is the last place a name should be drawn.
 */
export function polylineMidpoint(points: readonly Point[]): { point: Point; horizontal: boolean } | null {
  if (!points.length) return null;
  if (points.length === 1) return { point: points[0], horizontal: true };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let remaining = lengths.reduce((total, length) => total + length, 0) / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining > length && index < lengths.length - 1) { remaining -= length; continue; }
    const from = points[index]; const to = points[index + 1];
    const fraction = length ? remaining / length : 0;
    return {
      point: { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction },
      horizontal: Math.abs(to.x - from.x) >= Math.abs(to.y - from.y),
    };
  }
  return { point: points[0], horizontal: true };
}

/**
 * The elements a gesture is showing in place of the board's own, keyed by id -
 * what a move or a resize looks like before it commits. An edge is a statement
 * about what is joined rather than about where the line runs, so it is routed
 * against whichever box its ends are being drawn at: with no gesture in flight
 * that is the stored one, and during a drag it is the previewed one.
 */
export type ElementPreview = ReadonlyMap<string, CanvasElement>;

/** Routes a stored connector against the current board; null when an endpoint is gone. */
export function connectorPolyline(board: Pick<BoardDocument, "elements">, connector: Connector, preview?: ElementPreview | null): Point[] | null {
  const at = (id: string) => preview?.get(id) ?? board.elements[id];
  const from = at(connector.from.elementId);
  const to = at(connector.to.elementId);
  if (!from || !to || from.hidden || to.hidden) return null;
  return routeConnector(from, to, connector);
}
