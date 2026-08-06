import { describe, expect, it, vi } from "vitest";
import { createBoard } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { connectorPolyline, type ElementPreview } from "@/core/connectors/routing";
import { selectedConnectorPolylines } from "@/core/connectors/selection";
import type { CanvasElement, Point } from "@/core/elements/types";
import { renderScene } from "@/core/rendering/render-scene";
import { useBoardStore } from "@/stores/board-store";

const A = { x: 0, y: 0, width: 100, height: 60 };
const B = { x: 300, y: 0, width: 100, height: 60 };

/**
 * Two rectangles side by side with one auto-anchored edge between them, on a
 * plain background so the only path the canvas draws is the edge's own.
 */
function wiredBoard() {
  const document = createBoard("Connector live-move test") as BoardDocument;
  useBoardStore.getState().setBoard({ ...document, preferences: { ...document.preferences, backgroundPattern: "none" } });
  const store = useBoardStore.getState();
  const aId = store.createShape("rectangle", A)!;
  const bId = store.createShape("rectangle", B)!;
  const edgeId = store.createConnector({ elementId: aId, port: "auto" }, { elementId: bId, port: "auto" })!;
  const board = () => useBoardStore.getState().board!;
  return { aId, bId, edgeId, board, edge: () => board().connectors[edgeId], element: (id: string) => board().elements[id] };
}

const preview = (...elements: CanvasElement[]): ElementPreview => new Map(elements.map((element) => [element.id, element]));

const shifted = (element: CanvasElement, dx: number, dy: number): CanvasElement => ({ ...element, x: element.x + dx, y: element.y + dy });

const first = (points: Point[]) => points[0];
const last = (points: Point[]) => points[points.length - 1];

/**
 * What the canvas actually put down for the edge: the one polyline it strokes
 * and the closed triangle it fills for the head. Elements are left out, so
 * nothing else contributes a path.
 */
function drawnEdge(board: BoardDocument, elementPreview?: ElementPreview | null): { route: Point[]; head: Point[] } {
  let subpath: Point[] = [];
  const stroked: Point[][] = [];
  const filled: Point[][] = [];
  const context = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    rotate: vi.fn(), ellipse: vi.fn(), arc: vi.fn(), roundRect: vi.fn(), fillText: vi.fn(), closePath: vi.fn(),
    setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 40 })),
    beginPath: vi.fn(() => { subpath = []; }),
    moveTo: vi.fn((x: number, y: number) => { subpath.push({ x, y }); }),
    lineTo: vi.fn((x: number, y: number) => { subpath.push({ x, y }); }),
    stroke: vi.fn(() => { stroked.push(subpath); }),
    fill: vi.fn(() => { filled.push(subpath); }),
  } as unknown as CanvasRenderingContext2D;
  renderScene({ context, board, viewport: { x: 0, y: 0, zoom: 1 }, elements: [], elementPreview, canvasSize: { width: 800, height: 600 }, draftShape: null });
  return { route: stroked[0], head: filled.find((path) => path.length === 3) ?? [] };
}

describe("an edge while a shape it joins is being dragged", () => {
  it("leaves from the box the shape is being drawn at rather than the one it was let go at", () => {
    const { aId, edge, board, element } = wiredBoard();
    const stored = connectorPolyline(board(), edge())!;
    expect(first(stored)).toEqual({ x: 100, y: 30 });

    const dragged = connectorPolyline(board(), edge(), preview(shifted(element(aId), 0, 200)))!;
    // The dragged shape's own port has come with it; the other end has not moved at all.
    expect(first(dragged)).toEqual({ x: 100, y: 230 });
    expect(last(dragged)).toEqual(last(stored));
    // Nothing has been committed, so the document still routes the edge where it was.
    expect(connectorPolyline(board(), edge())).toEqual(stored);
  });

  it("re-resolves a facing port mid-drag rather than on release", () => {
    const { aId, edge, board, element } = wiredBoard();
    // Dragged past the object it points at, so the sides that face each other have swapped.
    const dragged = connectorPolyline(board(), edge(), preview(shifted(element(aId), 600, 0)))!;
    expect(first(dragged)).toEqual({ x: 600, y: 30 });
    expect(last(dragged)).toEqual({ x: 400, y: 30 });
  });

  it("keeps a pinned side pinned however far the shape is dragged", () => {
    const { aId, bId, board, element } = wiredBoard();
    const pinnedId = useBoardStore.getState().createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" })!;
    const dragged = connectorPolyline(board(), board().connectors[pinnedId], preview(shifted(element(aId), 600, 0)))!;
    // The east side is still the east side; only where it is has changed.
    expect(first(dragged)).toEqual({ x: 700, y: 30 });
  });

  it("follows a resize, so an edge stays on the handle being pulled", () => {
    const { aId, edge, board, element } = wiredBoard();
    const widened = connectorPolyline(board(), edge(), preview({ ...element(aId), width: 200 }))!;
    expect(first(widened)).toEqual({ x: 200, y: 30 });
  });

  it("leaves an edge the gesture is not holding exactly where it was", () => {
    const { aId, bId, board, element } = wiredBoard();
    const cId = useBoardStore.getState().createShape("rectangle", { x: 300, y: 300, width: 100, height: 60 })!;
    const otherId = useBoardStore.getState().createConnector({ elementId: bId, port: "auto" }, { elementId: cId, port: "auto" })!;
    const other = () => board().connectors[otherId];
    const stored = connectorPolyline(board(), other())!;
    expect(connectorPolyline(board(), other(), preview(shifted(element(aId), 0, 200)))).toEqual(stored);
  });

  it("routes against the document when no gesture is in flight", () => {
    const { edge, board } = wiredBoard();
    const stored = connectorPolyline(board(), edge());
    expect(connectorPolyline(board(), edge(), null)).toEqual(stored);
    expect(connectorPolyline(board(), edge(), preview())).toEqual(stored);
  });
});

describe("the canvas while a shape is being dragged", () => {
  it("strokes the edge at the previewed box", () => {
    const { aId, board, element } = wiredBoard();
    expect(first(drawnEdge(board()).route)).toEqual({ x: 100, y: 30 });
    expect(first(drawnEdge(board(), preview(shifted(element(aId), 0, 200))).route)).toEqual({ x: 100, y: 230 });
  });

  it("carries the head to the previewed end, so the arrow never points at where the shape was", () => {
    const { bId, edge, board, element } = wiredBoard();
    const moved = preview(shifted(element(bId), 0, -240));
    const { route, head } = drawnEdge(board(), moved);
    // The head's tip is the last point of the route it caps, which is the moved object's own port.
    expect(head[0]).toEqual(last(route));
    expect(last(route)).toEqual(last(connectorPolyline(board(), edge(), moved)!));
    expect(head[0]).not.toEqual(last(drawnEdge(board()).route));
  });
});

describe("the halo on a selected edge", () => {
  it("follows the same preview the canvas does, so the mark stays on its edge", () => {
    const { aId, edgeId, edge, board, element } = wiredBoard();
    const moved = preview(shifted(element(aId), 0, 200));
    const haloed = selectedConnectorPolylines(board(), [edgeId], moved);
    expect(haloed[0].points).toEqual(connectorPolyline(board(), edge(), moved));
    expect(haloed[0].points).not.toEqual(selectedConnectorPolylines(board(), [edgeId])[0].points);
  });
});
