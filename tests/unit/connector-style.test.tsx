import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { parseBoardCommand } from "@/core/commands/board-command";
import { connectorPolyline, polylineMidpoint } from "@/core/connectors/routing";
import { renderScene } from "@/core/rendering/render-scene";
import { StyleInspector } from "@/components/inspector/style-inspector";
import { applyConnectorPreview } from "@/features/inspector/style-values";
import { emptyHistory } from "@/features/history/history";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { DEFAULT_INSPECTOR_PREFERENCES, useUiPreferencesStore } from "@/stores/ui-preferences-store";

/** A context that records what it was asked to draw with, since nothing is painted in jsdom. */
const drawingContext = (record: { strokeColors?: string[]; dashes?: number[][] } = {}) => ({
  clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
  rotate: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), ellipse: vi.fn(),
  arc: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
  setLineDash: vi.fn((pattern: number[]) => { record.dashes?.push(pattern); }),
  measureText: vi.fn(() => ({ width: 40 })),
  set strokeStyle(value: string) { record.strokeColors?.push(value); },
}) as unknown as CanvasRenderingContext2D;

/** Three rectangles wired by two edges, so a control can be checked on one edge and on several. */
function wiredBoard() {
  useBoardStore.getState().setBoard(createBoard("Connector style test") as BoardDocument);
  const store = useBoardStore.getState();
  const aId = store.createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
  const bId = store.createShape("rectangle", { x: 300, y: 0, width: 100, height: 60 })!;
  const cId = store.createShape("rectangle", { x: 300, y: 200, width: 100, height: 60 })!;
  const firstId = store.createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" })!;
  const secondId = store.createConnector({ elementId: aId, port: "s" }, { elementId: cId, port: "w" })!;
  return { aId, bId, cId, firstId, secondId, edge: (id: string) => useBoardStore.getState().board!.connectors[id] };
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

describe("restyling edges through the store", () => {
  it("restyles every held edge as one history entry that undo takes back whole", () => {
    const { firstId, secondId, edge } = wiredBoard();
    const before = useBoardStore.getState().history.undo.length;
    useBoardStore.getState().updateConnectors([firstId, secondId], { strokeColor: "#4f6fa8", strokeWidth: 4 });
    expect(useBoardStore.getState().history.undo.length).toBe(before + 1);
    expect(edge(firstId).strokeColor).toBe("#4f6fa8");
    expect(edge(secondId).strokeWidth).toBe(4);

    useBoardStore.getState().undo();
    expect(edge(firstId).strokeColor).toBe("#b85f3f");
    expect(edge(secondId).strokeWidth).toBe(2);
    useBoardStore.getState().redo();
    expect(edge(firstId).strokeColor).toBe("#4f6fa8");
  });

  it("names an edge as its own kind of entry rather than as a style change", () => {
    const { firstId, edge } = wiredBoard();
    useBoardStore.getState().updateConnectors([firstId], { label: "publishes" }, "Rename connector", "rename");
    const entry = useBoardStore.getState().history.undo.at(-1)!;
    expect(entry.label).toBe("Rename connector");
    expect(entry.metadata?.intent).toBe("rename");
    expect(edge(firstId).label).toBe("publishes");
  });

  it("leaves an edge whose stored value moved under a stale patch alone", () => {
    const { firstId, edge } = wiredBoard();
    useBoardStore.getState().updateConnectors([firstId], { kind: "async" });
    // The guard only rejects an edit whose expectation is already wrong; a fresh one still lands.
    useBoardStore.getState().dispatchCommand(
      { type: "connectors.update", updates: [{ connectorId: firstId, patch: { kind: "data" }, expected: { kind: "sync" } }] },
      { commandId: "stale", actorId: "local", label: "Stale restyle", intent: "style" },
    );
    expect(edge(firstId).kind).toBe("async");
  });

  it("accepts every styling key the inspector sends and rejects one it does not carry", () => {
    const updates = [{ connectorId: "edge", patch: { strokeColor: "#3f7f78", strokeWidth: 4, kind: "data" as const, label: "reads" } }];
    expect(parseBoardCommand({ type: "connectors.update", updates })).not.toBeNull();
    expect(parseBoardCommand({ type: "connectors.update", updates: [{ connectorId: "edge", patch: { opacity: .5 } }] })).toBeNull();
    expect(parseBoardCommand({ type: "connectors.update", updates: [{ connectorId: "edge", patch: { label: "x".repeat(121) } }] })).toBeNull();
  });
});

describe("previewing an edge style", () => {
  it("leaves an edge the preview does not cover exactly as it was", () => {
    const { firstId, secondId, edge } = wiredBoard();
    const untouched = edge(secondId);
    const preview = { connectorIds: [firstId], patch: { strokeColor: "#6f8f72" } };
    expect(applyConnectorPreview(untouched, preview)).toBe(untouched);
    expect(applyConnectorPreview(edge(firstId), preview).strokeColor).toBe("#6f8f72");
    expect(applyConnectorPreview(untouched, null)).toBe(untouched);
    // The preview is a drawing, not an edit: the stored edge keeps its own color.
    expect(edge(firstId).strokeColor).toBe("#b85f3f");
  });

  it("draws the edges it was handed rather than the board's own", () => {
    const { firstId, edge } = wiredBoard();
    const strokeColors: string[] = [];
    const dashes: number[][] = [];
    const context = drawingContext({ strokeColors, dashes });
    const board = useBoardStore.getState().board!;
    const previewed = [{ ...edge(firstId), strokeColor: "#7b5f86", kind: "async" as const }];
    renderScene({ context, board, viewport: { x: 0, y: 0, zoom: 1 }, elements: [], connectors: previewed, canvasSize: { width: 600, height: 400 }, draftShape: null });
    expect(strokeColors).toContain("#7b5f86");
    expect(strokeColors).not.toContain("#b85f3f");
    // The kind is the dash pattern, so previewing one shows the line it will become.
    expect(dashes).toContainEqual([9, 7]);
  });
});

describe("where an edge's name is drawn", () => {
  it("lands half way along the route rather than on a bend or an arrowhead", () => {
    // A two-point route's middle vertex is its arrowhead, which is the last place a name should sit.
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ point: { x: 50, y: 0 }, horizontal: true });
    // An elbow: 100 right then 100 down, so half its length is the corner it turns.
    const elbow = polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])!;
    expect(elbow.point).toEqual({ x: 100, y: 0 });
    // A run of unequal arms puts the name inside the longer one.
    const uneven = polylineMidpoint([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 200 }])!;
    expect(uneven.point).toEqual({ x: 20, y: 90 });
    expect(uneven.horizontal).toBe(false);
    expect(polylineMidpoint([])).toBeNull();
  });

  it("sets a name off the line it names, above a horizontal run and beside a vertical one", () => {
    const { firstId, secondId, edge } = wiredBoard();
    useBoardStore.getState().updateConnectors([firstId, secondId], { label: "publishes" }, "Rename connector", "rename");
    const board = useBoardStore.getState().board!;
    const names = (connector: typeof board.connectors[string]) => {
      const context = drawingContext();
      renderScene({ context, board, viewport: { x: 0, y: 0, zoom: 1 }, elements: [], connectors: [connector], canvasSize: { width: 800, height: 600 }, draftShape: null });
      return vi.mocked(context.fillText).mock.calls.filter(([text]) => text === "publishes");
    };
    const route = connectorPolyline(board, edge(firstId))!;
    const middle = polylineMidpoint(route)!;
    const [[, x, y]] = names(edge(firstId));
    expect(x).toBeCloseTo(middle.point.x, 6);
    expect(y).toBeLessThan(middle.point.y);
    // The second edge leaves the south port, so its name is set beside the run rather than over it.
    const other = polylineMidpoint(connectorPolyline(board, edge(secondId))!)!;
    const [[, otherX, otherY]] = names(edge(secondId));
    if (other.horizontal) expect(otherY).toBeLessThan(other.point.y);
    else { expect(otherX).toBeGreaterThan(other.point.x); expect(otherY).toBeCloseTo(other.point.y, 6); }
  });
});

describe("the inspector with edges held", () => {
  const showInspector = (connectorIds: string[]) => {
    useSessionStore.getState().setSelectedConnectors(connectorIds);
    return render(<StyleInspector />);
  };

  it("offers an edge its own controls and none of the ones it has no use for", () => {
    const { firstId } = wiredBoard();
    showInspector([firstId]);
    expect(screen.getByText("Connector")).toBeVisible();
    expect(screen.getByRole("group", { name: /^Stroke/ })).toBeVisible();
    expect(screen.getByRole("group", { name: /^Connector kind/ })).toBeVisible();
    expect(screen.getByLabelText("Connector label")).toBeVisible();
    // An edge has no interior, no text block, and no box, so those controls are not shown at all.
    expect(screen.queryByRole("group", { name: /^Fill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /^Text size/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Opacity")).not.toBeInTheDocument();
  });

  it("counts the edges it is holding and drops the label field for more than one", () => {
    const { firstId, secondId } = wiredBoard();
    showInspector([firstId, secondId]);
    expect(screen.getByText("2 connectors")).toBeVisible();
    expect(screen.queryByLabelText("Connector label")).not.toBeInTheDocument();
  });

  it("applies a width and a kind to every held edge in one entry each", () => {
    const { firstId, secondId, edge } = wiredBoard();
    showInspector([firstId, secondId]);
    const before = useBoardStore.getState().history.undo.length;
    fireEvent.click(screen.getByLabelText("Set connector width to 4"));
    fireEvent.click(screen.getByLabelText("Set connector kind to data"));
    expect(edge(firstId).strokeWidth).toBe(4);
    expect(edge(secondId).kind).toBe("data");
    expect(useBoardStore.getState().history.undo.length).toBe(before + 2);
  });

  it("reports edges that disagree as mixed and shows what the held edges share", () => {
    const { firstId, secondId } = wiredBoard();
    useBoardStore.getState().updateConnectors([secondId], { kind: "async" });
    showInspector([firstId, secondId]);
    expect(screen.getByRole("group", { name: /Mixed/ }).textContent).toContain("Connector kind");
    expect(screen.getByLabelText("Set connector width to 2")).toHaveAttribute("aria-pressed", "true");
  });

  it("writes a name on the held edge, clears it back to nothing, and reverts on Escape", () => {
    const { firstId, edge } = wiredBoard();
    showInspector([firstId]);
    const field = screen.getByLabelText("Connector label");
    fireEvent.change(field, { target: { value: "  publishes  " } });
    fireEvent.blur(field);
    expect(edge(firstId).label).toBe("publishes");

    const reopened = screen.getByLabelText("Connector label") as HTMLInputElement;
    expect(reopened.value).toBe("publishes");
    fireEvent.change(reopened, { target: { value: "renamed" } });
    fireEvent.keyDown(reopened, { key: "Escape" });
    fireEvent.blur(reopened);
    expect(edge(firstId).label).toBe("publishes");

    const cleared = screen.getByLabelText("Connector label");
    fireEvent.change(cleared, { target: { value: "" } });
    fireEvent.blur(cleared);
    // An edge with nothing written on it carries no name at all, so nothing is drawn on its route.
    expect(edge(firstId).label).toBeNull();
  });

  it("shows the color being tried out without writing it to the board until it is committed", () => {
    const { firstId, edge } = wiredBoard();
    showInspector([firstId]);
    const picker = screen.getByLabelText("Custom stroke color");
    fireEvent.input(picker, { target: { value: "#3f7f78" } });
    expect(useSessionStore.getState().connectorStylePreview).toEqual({ connectorIds: [firstId], patch: { strokeColor: "#3f7f78" } });
    expect(edge(firstId).strokeColor).toBe("#b85f3f");

    fireEvent.blur(picker);
    expect(useSessionStore.getState().connectorStylePreview).toBeNull();
    expect(edge(firstId).strokeColor).toBe("#3f7f78");
  });

  it("stops previewing when the selection stops holding the edges", () => {
    const { firstId } = wiredBoard();
    const view = showInspector([firstId]);
    fireEvent.input(screen.getByLabelText("Custom stroke color"), { target: { value: "#d4a72c" } });
    expect(useSessionStore.getState().connectorStylePreview).not.toBeNull();
    useSessionStore.getState().setSelectedConnectors([]);
    view.rerender(<StyleInspector />);
    expect(useSessionStore.getState().connectorStylePreview).toBeNull();
  });
});
