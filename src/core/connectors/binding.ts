import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement, ConnectorEndpoint, Point, PortSide } from "@/core/elements/types";
import { shapeContainsPoint } from "@/core/geometry/hit-testing";
import { PORT_SIDES, portPoint } from "./ports";
import { routeConnector } from "./routing";

/** Screen radius within which a press takes an element's port rather than the element itself. */
export const PORT_HIT_RADIUS = 10;

/** The same screen tolerance the select tool grabs a shape with, so a connector takes what a click would have. */
const BODY_HIT_PADDING = 6;

/** What a connector may bind to. Locked and hidden objects are left alone, as they are by selection. */
export const connectable = (element: CanvasElement): boolean => !element.hidden && !element.locked;

export type PortAnchor = { side: PortSide; point: Point };

/** The four anchor points of an element, on the box a connector anchors to. */
export function elementPorts(element: CanvasElement): PortAnchor[] {
  return PORT_SIDES.map((side) => ({ side, point: portPoint(element, side) }));
}

/**
 * What a connect gesture takes at a point, topmost first: the port under the
 * pointer when it is on one, otherwise the element it is inside bound to
 * whichever port the geometry faces at the time. Ports are asked about before
 * the body of the same element, so a dot half outside a silhouette is still
 * grabbable, but never before the body of an element drawn over it.
 */
export function connectPick(elements: readonly CanvasElement[], point: Point, zoom: number): ConnectorEndpoint | null {
  const reach = PORT_HIT_RADIUS / zoom;
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (!connectable(element)) continue;
    for (const { side, point: anchor } of elementPorts(element)) {
      if (Math.hypot(anchor.x - point.x, anchor.y - point.y) <= reach) return { elementId: element.id, port: side };
    }
    if (shapeContainsPoint(element, point, BODY_HIT_PADDING / zoom)) return { elementId: element.id, port: "auto" };
  }
  return null;
}

/** Whether the board already holds this exact binding, so wiring one pair the same way twice is a no-op. */
export function bindingExists(board: Pick<BoardDocument, "connectorIds" | "connectors">, from: ConnectorEndpoint, to: ConnectorEndpoint): boolean {
  return board.connectorIds.some((id) => {
    const connector = board.connectors[id];
    return Boolean(connector)
      && connector.from.elementId === from.elementId && connector.from.port === from.port
      && connector.to.elementId === to.elementId && connector.to.port === to.port;
  });
}

/**
 * The polyline a connect gesture previews. It is routed by the same function
 * that draws the committed connector, so an edge lands exactly where the drag
 * showed it. While the gesture is still looking for its other end the pointer
 * stands in as a box with no size, which routes and stops at the pointer.
 */
export function connectorDraft(elements: Record<string, CanvasElement>, from: ConnectorEndpoint, to: ConnectorEndpoint | null, pointer: Point): Point[] | null {
  const source = elements[from.elementId];
  if (!source) return null;
  const target = to ? elements[to.elementId] : undefined;
  const toBounds = target ? target : { x: pointer.x, y: pointer.y, width: 0, height: 0 };
  return routeConnector(source, toBounds, { from, to: target && to ? to : { elementId: "", port: "auto" } });
}
