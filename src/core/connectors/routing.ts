import type { BoardDocument } from "@/core/board/types";
import type { Connector, Point, PortSide } from "@/core/elements/types";
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

/** Routes a stored connector against the current board; null when an endpoint is gone. */
export function connectorPolyline(board: Pick<BoardDocument, "elements">, connector: Connector): Point[] | null {
  const from = board.elements[connector.from.elementId];
  const to = board.elements[connector.to.elementId];
  if (!from || !to || from.hidden || to.hidden) return null;
  return routeConnector(from, to, connector);
}
