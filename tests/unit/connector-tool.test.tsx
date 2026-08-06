import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, createConnector, createShape } from "@/core/board/factory";
import { bindingExists, connectable, connectorDraft, connectPick, elementPorts, PORT_HIT_RADIUS } from "@/core/connectors/binding";
import { routeConnector } from "@/core/connectors/routing";
import { InteractionOverlay } from "@/components/canvas/interaction-overlay";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement } from "@/core/elements/types";

const rect = (x: number, y: number, width = 100, height = 60) => createShape("rectangle", { x, y, width, height });
const byId = (elements: CanvasElement[]) => Object.fromEntries(elements.map((element) => [element.id, element]));
const viewport = { x: 0, y: 0, zoom: 1 };

describe("connector anchors", () => {
  it("puts one anchor on the middle of each edge of the element's box", () => {
    const element = rect(100, 100, 200, 80);
    expect(elementPorts(element).map(({ side, point }) => [side, point.x, point.y])).toEqual([
      ["n", 200, 100], ["e", 300, 140], ["s", 200, 180], ["w", 100, 140],
    ]);
  });

  it("treats every visible unlocked node as connectable", () => {
    expect(["rectangle", "ellipse", "diamond"].every((type) => connectable(createShape(type as "rectangle", { x: 0, y: 0, width: 40, height: 40 })))).toBe(true);
    expect(connectable({ ...rect(0, 0), locked: true })).toBe(false);
    expect(connectable({ ...rect(0, 0), hidden: true })).toBe(false);
  });
});

describe("what a connect gesture picks", () => {
  it("takes the port under the pointer, and the element itself anywhere else inside it", () => {
    const element = rect(0, 0, 100, 60);
    expect(connectPick([element], { x: 100, y: 30 }, 1)).toEqual({ elementId: element.id, port: "e" });
    expect(connectPick([element], { x: 50, y: 30 }, 1)).toEqual({ elementId: element.id, port: "auto" });
  });

  it("keeps the port reach a screen distance, so it does not grow as the canvas zooms out", () => {
    const element = rect(0, 0, 100, 60);
    const justOutside = { x: 100 + PORT_HIT_RADIUS + 1, y: 30 };
    expect(connectPick([element], justOutside, 1)).toBeNull();
    // At half zoom the same screen radius reaches twice as far in board coordinates.
    expect(connectPick([element], justOutside, .5)).toEqual({ elementId: element.id, port: "e" });
  });

  it("picks nothing on empty board, and nothing from a locked object or a hidden one", () => {
    const locked = { ...rect(200, 0), locked: true };
    const hidden = { ...rect(400, 0), hidden: true };
    expect(connectPick([locked, hidden], { x: 50, y: 30 }, 1)).toBeNull();
    expect(connectPick([locked, hidden], { x: 250, y: 30 }, 1)).toBeNull();
    expect(connectPick([locked, hidden], { x: 450, y: 30 }, 1)).toBeNull();
  });

  it("asks the topmost element first, so an anchor behind another object never wins over its body", () => {
    const under = rect(0, 0, 100, 60);
    const over = rect(80, 0, 100, 60);
    // The pointer is on `under`'s east port and inside `over`, which is drawn on top.
    expect(connectPick([under, over], { x: 100, y: 30 }, 1)).toEqual({ elementId: over.id, port: "auto" });
  });
});

describe("the edge a drag previews", () => {
  it("routes the preview exactly as the committed connector will be drawn", () => {
    const a = rect(0, 0);
    const b = rect(300, 0);
    const from = { elementId: a.id, port: "e" as const };
    const to = { elementId: b.id, port: "w" as const };
    const preview = connectorDraft(byId([a, b]), from, to, { x: 250, y: 30 });
    expect(preview).toEqual(routeConnector(a, b, { from, to }));
  });

  it("stops at the pointer while the edge has not found its other end", () => {
    const a = rect(0, 0);
    const preview = connectorDraft(byId([a]), { elementId: a.id, port: "e" }, null, { x: 400, y: 200 })!;
    expect(preview[0]).toEqual({ x: 100, y: 30 });
    expect(preview[preview.length - 1]).toEqual({ x: 400, y: 200 });
  });

  it("previews nothing once the object it left from is gone", () => {
    expect(connectorDraft({}, { elementId: "gone", port: "auto" }, null, { x: 0, y: 0 })).toBeNull();
  });
});

describe("wiring one pair twice", () => {
  it("recognizes only the same binding, not a reversed or re-anchored one", () => {
    const a = rect(0, 0);
    const b = rect(300, 0);
    const connector = createConnector({ elementId: a.id, port: "e" }, { elementId: b.id, port: "w" });
    const board = { connectorIds: [connector.id], connectors: { [connector.id]: connector } };
    expect(bindingExists(board, { elementId: a.id, port: "e" }, { elementId: b.id, port: "w" })).toBe(true);
    expect(bindingExists(board, { elementId: b.id, port: "w" }, { elementId: a.id, port: "e" })).toBe(false);
    expect(bindingExists(board, { elementId: a.id, port: "auto" }, { elementId: b.id, port: "w" })).toBe(false);
  });
});

describe("the connector overlay", () => {
  it("draws a dot per anchor with the chosen one filled, and the edge in progress", () => {
    const { container } = render(<InteractionOverlay
      bounds={null}
      marquee={null}
      snapBounds={null}
      viewport={viewport}
      connect={{
        ports: [{ key: "a:n", point: { x: 10, y: 0 }, active: false }, { key: "a:e", point: { x: 20, y: 5 }, active: true }],
        draft: [{ x: 20, y: 5 }, { x: 60, y: 5 }],
      }}
    />);
    expect(container.querySelectorAll(".connector-port")).toHaveLength(2);
    expect(container.querySelectorAll(".connector-port.active")).toHaveLength(1);
    expect(container.querySelector(".connector-draft")).toHaveAttribute("points", "20,5 60,5");
  });

  it("draws no edge for a polyline that has not reached two points", () => {
    const { container } = render(<InteractionOverlay bounds={null} marquee={null} snapBounds={null} viewport={viewport} connect={{ ports: [], draft: [{ x: 0, y: 0 }] }} />);
    expect(container.querySelector(".connector-draft")).toBeNull();
  });
});

describe("connecting through the board store", () => {
  beforeEach(() => {
    useBoardStore.getState().setBoard(createBoard() as BoardDocument);
    useSessionStore.getState().setTool("select");
  });

  it("records one history entry that an undo takes back whole", () => {
    const aId = useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
    const bId = useBoardStore.getState().createShape("rectangle", { x: 300, y: 0, width: 100, height: 60 })!;
    const before = useBoardStore.getState().history.undo.length;
    const connectorId = useBoardStore.getState().createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" })!;
    expect(useBoardStore.getState().history.undo).toHaveLength(before + 1);
    expect(useBoardStore.getState().board!.connectors[connectorId]).toMatchObject({ from: { elementId: aId, port: "e" }, to: { elementId: bId, port: "w" } });
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().board!.connectorIds).toEqual([]);
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().board!.connectorIds).toEqual([connectorId]);
  });

  it("refuses to join an object to itself", () => {
    const aId = useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
    expect(useBoardStore.getState().createConnector({ elementId: aId, port: "auto" }, { elementId: aId, port: "auto" })).toBeNull();
    expect(useBoardStore.getState().board!.connectorIds).toEqual([]);
  });

  it("offers the connector as a tool of its own", () => {
    useSessionStore.getState().setTool("connector");
    expect(useSessionStore.getState().activeTool).toBe("connector");
  });
});
