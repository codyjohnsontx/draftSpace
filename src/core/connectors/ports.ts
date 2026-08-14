import type { Bounds, Connector, Point, PortSide } from "@/core/elements/types";

export const PORT_SIDES: PortSide[] = ["n", "e", "s", "w"];

/** The two coordinates of a port anchor, apart, so a hot scan can measure one without building a point. */
export const portX = (bounds: Bounds, side: PortSide): number =>
  side === "w" ? bounds.x : side === "e" ? bounds.x + bounds.width : bounds.x + bounds.width / 2;
export const portY = (bounds: Bounds, side: PortSide): number =>
  side === "n" ? bounds.y : side === "s" ? bounds.y + bounds.height : bounds.y + bounds.height / 2;

/** Anchor point of a port on a shape's axis-aligned bounds, in board coordinates. */
export function portPoint(bounds: Bounds, side: PortSide): Point {
  return { x: portX(bounds, side), y: portY(bounds, side) };
}

/** Outward unit direction of a port. */
export function portDirection(side: PortSide): Point {
  if (side === "n") return { x: 0, y: -1 };
  if (side === "s") return { x: 0, y: 1 };
  if (side === "w") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

const center = (bounds: Bounds): Point => ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });

/**
 * Resolves "auto" endpoints to the facing pair of ports for the current
 * geometry, so connectors re-anchor sensibly as nodes move. Explicit ports
 * are respected.
 */
export function resolveConnectorPorts(fromBounds: Bounds, toBounds: Bounds, connector: Pick<Connector, "from" | "to">): { fromPort: PortSide; toPort: PortSide } {
  const fromCenter = center(fromBounds);
  const toCenter = center(toBounds);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const fromPort: PortSide = connector.from.port !== "auto" ? connector.from.port : horizontal ? (dx >= 0 ? "e" : "w") : (dy >= 0 ? "s" : "n");
  const toPort: PortSide = connector.to.port !== "auto" ? connector.to.port : horizontal ? (dx >= 0 ? "w" : "e") : (dy >= 0 ? "n" : "s");
  return { fromPort, toPort };
}
