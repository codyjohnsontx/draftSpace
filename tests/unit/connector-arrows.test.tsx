import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard, createConnector, createShape } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { parseBoardCommand } from "@/core/commands/board-command";
import { connectorPolyline } from "@/core/connectors/routing";
import { arrowsAtSource, arrowsAtTarget, DEFAULT_CONNECTOR_ARROWS, type Connector, type Point } from "@/core/elements/types";
import { arrowheadSize, renderScene } from "@/core/rendering/render-scene";
import { StyleInspector } from "@/components/inspector/style-inspector";
import { emptyHistory } from "@/features/history/history";
import { migrateStoredBoard } from "@/migrations/board-migrations";
import { boardSchema } from "@/schemas/board-schema";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { DEFAULT_INSPECTOR_PREFERENCES, useUiPreferencesStore } from "@/stores/ui-preferences-store";

const A = { x: 0, y: 0, width: 100, height: 60 };
const B = { x: 300, y: 200, width: 100, height: 60 };

/** A head as the canvas drew it: the three corners of one filled, closed triangle. */
type Head = { tip: Point; barbs: [Point, Point] };

/**
 * Draws the board and pulls out every arrowhead. A head is the one subpath the
 * connector draw closes and fills; the edge's own line is stroked and never
 * closed, so the two cannot be confused.
 */
function drawnHeads(board: BoardDocument): Head[] {
  const heads: Head[] = [];
  let subpath: Point[] = [];
  let closed = false;
  const context = {
    clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
    rotate: vi.fn(), ellipse: vi.fn(), arc: vi.fn(), roundRect: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
    setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 40 })),
    beginPath: vi.fn(() => { subpath = []; closed = false; }),
    moveTo: vi.fn((x: number, y: number) => { subpath.push({ x, y }); }),
    lineTo: vi.fn((x: number, y: number) => { subpath.push({ x, y }); }),
    closePath: vi.fn(() => { closed = true; }),
    fill: vi.fn(() => {
      if (closed && subpath.length === 3) heads.push({ tip: subpath[0], barbs: [subpath[1], subpath[2]] });
    }),
  } as unknown as CanvasRenderingContext2D;
  renderScene({ context, board, viewport: { x: 0, y: 0, zoom: 1 }, elements: [], canvasSize: { width: 800, height: 600 }, draftShape: null });
  return heads;
}

/** How long a head is along the line: from its tip back to the middle of its two barbs. */
const headLength = ({ tip, barbs }: Head) =>
  Math.hypot(tip.x - (barbs[0].x + barbs[1].x) / 2, tip.y - (barbs[0].y + barbs[1].y) / 2);

/** Which way a head points, as a unit vector from the middle of its barbs to its tip. */
function headDirection({ tip, barbs }: Head): Point {
  const back = { x: (barbs[0].x + barbs[1].x) / 2, y: (barbs[0].y + barbs[1].y) / 2 };
  const length = Math.hypot(tip.x - back.x, tip.y - back.y);
  return { x: (tip.x - back.x) / length, y: (tip.y - back.y) / length };
}

/** Two rectangles set apart on both axes, wired one way, so the two ends are far enough apart to tell apart. */
function wiredBoard(patch?: Partial<Pick<Connector, "arrows" | "strokeWidth">>) {
  useBoardStore.getState().setBoard(createBoard("Connector arrows test") as BoardDocument);
  const store = useBoardStore.getState();
  const aId = store.createShape("rectangle", A)!;
  const bId = store.createShape("rectangle", B)!;
  const edgeId = store.createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" })!;
  if (patch) store.updateConnectors([edgeId], patch);
  return { aId, bId, edgeId, edge: () => useBoardStore.getState().board!.connectors[edgeId], board: () => useBoardStore.getState().board! };
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  useBoardStore.setState({ board: null, history: emptyHistory(), revision: 0 });
  useSessionStore.setState({ selectedIds: [], selectedConnectorIds: [], stylePreview: null, connectorStylePreview: null });
  useUiPreferencesStore.setState({ hydrated: true, inspector: { ...DEFAULT_INSPECTOR_PREFERENCES } });
});

afterEach(() => {
  useSessionStore.setState({ selectedIds: [], selectedConnectorIds: [], stylePreview: null, connectorStylePreview: null });
  vi.unstubAllGlobals();
});

describe("which ends an edge points at", () => {
  it("gives a new edge one head at what it was dragged to", () => {
    expect(DEFAULT_CONNECTOR_ARROWS).toBe("end");
    const { edge } = wiredBoard();
    expect(edge().arrows).toBe("end");
    expect(createConnector({ elementId: "a", port: "auto" }, { elementId: "b", port: "auto" }).arrows).toBe("end");
  });

  it("names the two ends of the binding rather than a direction on screen", () => {
    expect([arrowsAtSource("none"), arrowsAtTarget("none")]).toEqual([false, false]);
    expect([arrowsAtSource("end"), arrowsAtTarget("end")]).toEqual([false, true]);
    expect([arrowsAtSource("start"), arrowsAtTarget("start")]).toEqual([true, false]);
    expect([arrowsAtSource("both"), arrowsAtTarget("both")]).toEqual([true, true]);
  });

  it("draws a head on the end of the route that end names", () => {
    const { board, edgeId } = wiredBoard();
    const route = connectorPolyline(board(), board().connectors[edgeId])!;
    const target = route[route.length - 1];
    const source = route[0];

    const pointing = drawnHeads(board());
    expect(pointing.map((head) => head.tip)).toEqual([target]);

    useBoardStore.getState().updateConnectors([edgeId], { arrows: "start" });
    expect(drawnHeads(board()).map((head) => head.tip)).toEqual([source]);

    useBoardStore.getState().updateConnectors([edgeId], { arrows: "both" });
    expect(drawnHeads(board()).map((head) => head.tip)).toEqual([target, source]);

    useBoardStore.getState().updateConnectors([edgeId], { arrows: "none" });
    expect(drawnHeads(board())).toEqual([]);
  });

  it("aims each head along the route's own run into that end", () => {
    const { board } = wiredBoard({ arrows: "both" });
    const route = connectorPolyline(board(), Object.values(board().connectors)[0])!;
    const [target, source] = drawnHeads(board());
    // The elbow arrives at the west port running east and leaves the east port running east, so both point east.
    const arriving = { x: route[route.length - 1].x - route[route.length - 2].x, y: route[route.length - 1].y - route[route.length - 2].y };
    const leaving = { x: route[0].x - route[1].x, y: route[0].y - route[1].y };
    const unit = (vector: Point) => ({ x: vector.x / Math.hypot(vector.x, vector.y), y: vector.y / Math.hypot(vector.x, vector.y) });
    expect(headDirection(target).x).toBeCloseTo(unit(arriving).x, 6);
    expect(headDirection(target).y).toBeCloseTo(unit(arriving).y, 6);
    // The source head points back out of the object the edge starts from rather than along it.
    expect(headDirection(source).x).toBeCloseTo(unit(leaving).x, 6);
    expect(headDirection(source).y).toBeCloseTo(unit(leaving).y, 6);
  });
});

describe("how large a head is drawn", () => {
  it("keeps the default edge at the size every arrowhead has always been drawn at", () => {
    expect(arrowheadSize(2)).toBe(9);
  });

  it("grows the head with the ink it caps, so a wide edge never ends in a barb narrower than itself", () => {
    const { board, edgeId } = wiredBoard();
    let previous = 0;
    // Every width the inspector offers, measured off the head the canvas actually drew.
    for (const strokeWidth of [1, 2, 4, 8]) {
      useBoardStore.getState().updateConnectors([edgeId], { strokeWidth });
      const head = drawnHeads(board())[0];
      // A barb sits its full size back from the tip at 30° off the line, so the head is that much shorter along it.
      expect(headLength(head)).toBeCloseTo(arrowheadSize(strokeWidth) * Math.cos(Math.PI / 6), 6);
      expect(headLength(head)).toBeGreaterThan(previous);
      previous = headLength(head);
      // The barbs span wider than the line the head caps, so the arrow still reads as one.
      expect(Math.hypot(head.barbs[0].x - head.barbs[1].x, head.barbs[0].y - head.barbs[1].y)).toBeGreaterThan(strokeWidth);
    }
  });
});

describe("choosing which ends carry a head", () => {
  it("re-points every held edge as one history entry that undo takes back", () => {
    const { edgeId, edge } = wiredBoard();
    const before = useBoardStore.getState().history.undo.length;
    useBoardStore.getState().updateConnectors([edgeId], { arrows: "both" });
    expect(useBoardStore.getState().history.undo.length).toBe(before + 1);
    expect(edge().arrows).toBe("both");
    useBoardStore.getState().undo();
    expect(edge().arrows).toBe("end");
    useBoardStore.getState().redo();
    expect(edge().arrows).toBe("both");
  });

  it("accepts an arrows choice on a connector patch and rejects one it does not draw", () => {
    expect(parseBoardCommand({ type: "connectors.update", updates: [{ connectorId: "edge", patch: { arrows: "both" } }] })).not.toBeNull();
    expect(parseBoardCommand({ type: "connectors.update", updates: [{ connectorId: "edge", patch: { arrows: "tail" } }] })).toBeNull();
  });

  it("offers the choice beside the edge's other controls and applies it to every held edge", () => {
    const { edgeId, edge } = wiredBoard();
    useSessionStore.getState().setSelectedConnectors([edgeId]);
    render(<StyleInspector />);
    expect(screen.getByRole("group", { name: /^Arrows/ })).toBeVisible();
    expect(screen.getByLabelText("Set connector arrows to a head at the target")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Set connector arrows to heads at both ends"));
    expect(edge().arrows).toBe("both");
    expect(screen.getByLabelText("Set connector arrows to heads at both ends")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports edges pointing differently as mixed", () => {
    const { edgeId, aId, bId } = wiredBoard();
    const secondId = useBoardStore.getState().createConnector({ elementId: bId, port: "n" }, { elementId: aId, port: "s" })!;
    useBoardStore.getState().updateConnectors([secondId], { arrows: "none" });
    useSessionStore.getState().setSelectedConnectors([edgeId, secondId]);
    render(<StyleInspector />);
    expect(screen.getByRole("group", { name: /^Arrows/ }).textContent).toContain("Mixed");
    expect(screen.getByLabelText("Set connector arrows to no heads")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("arrow persistence without a schema version bump", () => {
  const boardWithEdge = (arrows: Connector["arrows"]) => {
    const board = createBoard("Arrow persistence") as BoardDocument;
    const from = createShape("rectangle", A);
    const to = createShape("rectangle", B);
    const connector = createConnector({ elementId: from.id, port: "e" }, { elementId: to.id, port: "w" }, { arrows });
    return {
      ...board,
      elementIds: [from.id, to.id], elements: { [from.id]: from, [to.id]: to },
      connectorIds: [connector.id], connectors: { [connector.id]: connector },
    };
  };

  it("round-trips the choice through the board schema at the version the board already had", () => {
    const board = boardWithEdge("both");
    const parsed = boardSchema.parse(JSON.parse(JSON.stringify(board)));
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.connectors[board.connectorIds[0]].arrows).toBe("both");
    const bogus = { ...board, connectors: { [board.connectorIds[0]]: { ...board.connectors[board.connectorIds[0]], arrows: "tail" } } };
    expect(boardSchema.safeParse(JSON.parse(JSON.stringify(bogus))).success).toBe(false);
  });

  it("reads an edge stored before heads were choosable as pointing at what it was drawn to", () => {
    const board = boardWithEdge("none");
    const edgeId = board.connectorIds[0];
    // A document written before this field existed carries no `arrows` key at all.
    const stored = JSON.parse(JSON.stringify(board)) as { connectors: Record<string, Record<string, unknown>> };
    delete stored.connectors[edgeId].arrows;
    // Same version stamp, so loading it is not a migration - the field defaults at parse time.
    const result = migrateStoredBoard(stored, 3);
    expect(result).toMatchObject({ ok: true, migrated: false });
    const parsed = boardSchema.parse((result as { value: unknown }).value);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.connectors[edgeId].arrows).toBe("end");
  });
});
