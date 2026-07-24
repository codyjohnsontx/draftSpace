import { describe, expect, it } from "vitest";
import { portDirection, portPoint, resolveConnectorPorts } from "@/core/connectors/ports";
import { connectorPolyline, routeConnector } from "@/core/connectors/routing";
import { createBoard, createConnector, createRectangle } from "@/core/board/factory";
import type { Point } from "@/core/elements/types";

const bounds = (x: number, y: number, width = 100, height = 60) => ({ x, y, width, height });
const autoConnector = { from: { elementId: "a", port: "auto" as const }, to: { elementId: "b", port: "auto" as const } };

const isOrthogonal = (points: Point[]) =>
  points.every((point, index) => index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y);

describe("ports", () => {
  it("anchors each port to the middle of its side", () => {
    const box = bounds(10, 20);
    expect(portPoint(box, "n")).toEqual({ x: 60, y: 20 });
    expect(portPoint(box, "e")).toEqual({ x: 110, y: 50 });
    expect(portPoint(box, "s")).toEqual({ x: 60, y: 80 });
    expect(portPoint(box, "w")).toEqual({ x: 10, y: 50 });
    expect(portDirection("n")).toEqual({ x: 0, y: -1 });
  });

  it("resolves auto ports to the facing pair", () => {
    expect(resolveConnectorPorts(bounds(0, 0), bounds(400, 0), autoConnector)).toEqual({ fromPort: "e", toPort: "w" });
    expect(resolveConnectorPorts(bounds(400, 0), bounds(0, 0), autoConnector)).toEqual({ fromPort: "w", toPort: "e" });
    expect(resolveConnectorPorts(bounds(0, 0), bounds(0, 400), autoConnector)).toEqual({ fromPort: "s", toPort: "n" });
    expect(resolveConnectorPorts(bounds(0, 400), bounds(0, 0), autoConnector)).toEqual({ fromPort: "n", toPort: "s" });
  });

  it("respects explicit ports", () => {
    const explicit = { from: { elementId: "a", port: "n" as const }, to: { elementId: "b", port: "s" as const } };
    expect(resolveConnectorPorts(bounds(0, 0), bounds(400, 0), explicit)).toEqual({ fromPort: "n", toPort: "s" });
  });
});

describe("routing", () => {
  it("produces an orthogonal polyline from port to port", () => {
    const points = routeConnector(bounds(0, 0), bounds(400, 200), autoConnector);
    expect(points[0]).toEqual({ x: 100, y: 30 });
    expect(points[points.length - 1]).toEqual({ x: 400, y: 230 });
    expect(isOrthogonal(points)).toBe(true);
    expect(points.length).toBeGreaterThanOrEqual(3);
  });

  it("tracks an endpoint when its element moves", () => {
    const before = routeConnector(bounds(0, 0), bounds(400, 0), autoConnector);
    const after = routeConnector(bounds(0, 0), bounds(400, 600), autoConnector);
    expect(before[before.length - 1]).toEqual({ x: 400, y: 30 });
    expect(after[after.length - 1]).toEqual({ x: 450, y: 600 });
    expect(isOrthogonal(after)).toBe(true);
  });

  it("handles mixed horizontal and vertical ports with a single corner", () => {
    const mixed = { from: { elementId: "a", port: "e" as const }, to: { elementId: "b", port: "n" as const } };
    const points = routeConnector(bounds(0, 0), bounds(400, 300), mixed);
    expect(isOrthogonal(points)).toBe(true);
    expect(points[points.length - 1]).toEqual({ x: 450, y: 300 });
  });

  it("routes stored connectors against the board and skips missing or hidden endpoints", () => {
    const board = createBoard();
    const a = createRectangle({ x: 0, y: 0, width: 100, height: 60 });
    const b = createRectangle({ x: 400, y: 0, width: 100, height: 60 });
    for (const element of [a, b]) { board.elementIds.push(element.id); board.elements[element.id] = element; }
    const connector = createConnector({ elementId: a.id, port: "auto" }, { elementId: b.id, port: "auto" });
    expect(connectorPolyline(board, connector)).not.toBeNull();
    expect(connectorPolyline(board, createConnector({ elementId: a.id, port: "auto" }, { elementId: "gone", port: "auto" }))).toBeNull();
    board.elements[b.id] = { ...b, hidden: true };
    expect(connectorPolyline(board, connector)).toBeNull();
  });
});
