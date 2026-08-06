import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { CONNECTOR_HIT_PADDING, distanceToPolyline, hitTestConnectors, selectedConnectorPolylines } from "@/core/connectors/selection";
import { connectorPolyline } from "@/core/connectors/routing";
import { localCommandMetadata } from "@/core/commands/board-command";
import { InteractionOverlay } from "@/components/canvas/interaction-overlay";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import type { BoardDocument } from "@/core/board/types";

const viewport = { x: 0, y: 0, zoom: 1 };

/** Two rectangles 200px apart with one edge wired between their facing ports. */
function wiredBoard() {
  useBoardStore.getState().setBoard(createBoard() as BoardDocument);
  const aId = useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
  const bId = useBoardStore.getState().createShape("rectangle", { x: 300, y: 0, width: 100, height: 60 })!;
  const connectorId = useBoardStore.getState().createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" })!;
  return { aId, bId, connectorId, board: () => useBoardStore.getState().board! };
}

describe("measuring an edge", () => {
  it("measures the drawn line rather than the box the elbows sweep out", () => {
    // An L: right along y=0, then down at x=100.
    const elbow = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(distanceToPolyline(elbow, { x: 50, y: 3 })).toBeCloseTo(3, 6);
    // The middle of the box the elbow encloses is nowhere near either arm.
    expect(distanceToPolyline(elbow, { x: 20, y: 80 })).toBeCloseTo(80, 6);
  });

  it("stops at each segment's ends rather than measuring the infinite line", () => {
    const segment = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(distanceToPolyline(segment, { x: 130, y: 0 })).toBeCloseTo(30, 6);
  });

  it("is out of reach of a polyline with nothing in it", () => {
    expect(distanceToPolyline([], { x: 0, y: 0 })).toBe(Infinity);
    expect(distanceToPolyline([{ x: 10, y: 0 }], { x: 0, y: 0 })).toBeCloseTo(10, 6);
  });
});

describe("what a click takes from among the edges", () => {
  beforeEach(() => { useSessionStore.getState().setSelected([]); });

  it("takes the edge under the pointer and nothing from the empty board beside it", () => {
    const { connectorId, board } = wiredBoard();
    const route = connectorPolyline(board(), board().connectors[connectorId])!;
    const middle = route[Math.floor(route.length / 2)];
    expect(hitTestConnectors(board(), middle, 1)?.id).toBe(connectorId);
    expect(hitTestConnectors(board(), { x: middle.x, y: middle.y + 200 }, 1)).toBeNull();
  });

  it("keeps its reach a screen distance, so an edge is no harder to hit zoomed out", () => {
    const { connectorId, board } = wiredBoard();
    // The edge runs along y = 30 between the two facing ports.
    const justOutside = { x: 200, y: 30 + CONNECTOR_HIT_PADDING + 1 };
    expect(hitTestConnectors(board(), justOutside, 1)).toBeNull();
    expect(hitTestConnectors(board(), justOutside, .5)?.id).toBe(connectorId);
  });

  it("leaves a locked edge alone, as selection leaves a locked element alone", () => {
    const { connectorId, board } = wiredBoard();
    useBoardStore.getState().dispatchCommand({ type: "connectors.update", updates: [{ connectorId, patch: { locked: true } }] }, localCommandMetadata("Lock edge", "style"));
    expect(hitTestConnectors(board(), { x: 200, y: 30 }, 1)).toBeNull();
  });

  it("takes nothing from an edge whose end is hidden, because nothing is drawn", () => {
    const { aId, board } = wiredBoard();
    useBoardStore.getState().updateElements([{ elementId: aId, patch: { hidden: true } }], "Hide", "style");
    expect(hitTestConnectors(board(), { x: 200, y: 30 }, 1)).toBeNull();
  });

  it("asks the topmost edge first", () => {
    const { aId, bId, connectorId, board } = wiredBoard();
    const second = useBoardStore.getState().createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" }, "async")!;
    expect(board().connectorIds).toEqual([connectorId, second]);
    expect(hitTestConnectors(board(), { x: 200, y: 30 }, 1)?.id).toBe(second);
  });
});

describe("a selection that holds an edge", () => {
  beforeEach(() => {
    useSessionStore.getState().setSelected([]);
    useSessionStore.getState().setSelectedConnectors([]);
  });

  it("drops the elements it held, and is dropped by them in turn", () => {
    const { aId, connectorId } = wiredBoard();
    useSessionStore.getState().setSelected([aId]);
    useSessionStore.getState().setSelectedConnectors([connectorId]);
    expect(useSessionStore.getState().selectedIds).toEqual([]);
    expect(useSessionStore.getState().selectedConnectorIds).toEqual([connectorId]);
    useSessionStore.getState().setSelected([aId]);
    expect(useSessionStore.getState().selectedConnectorIds).toEqual([]);
  });

  it("keeps the empty array it already had, so taking one kind alone re-renders nothing else", () => {
    const { aId } = wiredBoard();
    const before = useSessionStore.getState().selectedConnectorIds;
    useSessionStore.getState().setSelected([aId]);
    expect(useSessionStore.getState().selectedConnectorIds).toBe(before);
  });

  it("adds and removes an edge with a shift-click, dropping any elements held", () => {
    const { aId, bId, connectorId } = wiredBoard();
    const second = useBoardStore.getState().createConnector({ elementId: aId, port: "n" }, { elementId: bId, port: "n" })!;
    useSessionStore.getState().setSelected([aId]);
    useSessionStore.getState().toggleSelectedConnector(connectorId);
    useSessionStore.getState().toggleSelectedConnector(second);
    expect(useSessionStore.getState().selectedIds).toEqual([]);
    expect(useSessionStore.getState().selectedConnectorIds).toEqual([connectorId, second]);
    useSessionStore.getState().toggleSelectedConnector(connectorId);
    expect(useSessionStore.getState().selectedConnectorIds).toEqual([second]);
  });
});

describe("deleting an edge", () => {
  it("records one history entry that an undo puts back whole", () => {
    const { connectorId, board } = wiredBoard();
    const before = useBoardStore.getState().history.undo.length;
    useBoardStore.getState().deleteConnectors([connectorId]);
    expect(board().connectorIds).toEqual([]);
    expect(useBoardStore.getState().history.undo).toHaveLength(before + 1);
    useBoardStore.getState().undo();
    expect(board().connectorIds).toEqual([connectorId]);
    useBoardStore.getState().redo();
    expect(board().connectorIds).toEqual([]);
  });

  it("leaves the objects it joined on the board", () => {
    const { aId, bId, connectorId, board } = wiredBoard();
    useBoardStore.getState().deleteConnectors([connectorId]);
    expect(board().elementIds).toEqual([aId, bId]);
  });
});

describe("the halo on a selected edge", () => {
  it("draws the route the canvas draws, widened past the edge's own ink", () => {
    const { connectorId, board } = wiredBoard();
    const routed = selectedConnectorPolylines(board(), [connectorId]);
    expect(routed).toHaveLength(1);
    expect(routed[0].points).toEqual(connectorPolyline(board(), board().connectors[connectorId]));
    const { container } = render(<InteractionOverlay bounds={null} marquee={null} snapBounds={null} viewport={viewport} connectors={routed} />);
    const halo = container.querySelector(`[data-selected-connector="${connectorId}"]`)!;
    expect(halo).not.toBeNull();
    expect(Number(halo.getAttribute("stroke-width"))).toBeGreaterThan(routed[0].strokeWidth);
  });

  it("draws nothing for an edge the board no longer routes", () => {
    const { connectorId, board } = wiredBoard();
    useBoardStore.getState().deleteConnectors([connectorId]);
    expect(selectedConnectorPolylines(board(), [connectorId])).toEqual([]);
    const { container } = render(<InteractionOverlay bounds={null} marquee={null} snapBounds={null} viewport={viewport} connectors={[]} />);
    expect(container.querySelector(".connector-selection")).toBeNull();
  });

  it("masks the corridor of the edge's own ink out of the halo, so the edge keeps its color", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const strokeWidth = 4;
    const { container } = render(<InteractionOverlay bounds={null} marquee={null} snapBounds={null} viewport={viewport} connectors={[{ id: "c", points, strokeWidth }]} />);
    const halo = container.querySelector(".connector-selection")!;
    const maskId = halo.getAttribute("mask")!.match(/url\(#(.+)\)/)![1];
    const bands = container.querySelectorAll(`mask#${maskId} polyline`);
    expect(bands).toHaveLength(2);
    const kept = bands[0]; const cut = bands[1];
    // The mask keeps a wide band and cuts the ink's own corridor back out of it,
    // so the halo flanks the line instead of painting over it.
    expect(kept.getAttribute("stroke")).toBe("#fff");
    expect(cut.getAttribute("stroke")).toBe("#000");
    expect(Number(cut.getAttribute("stroke-width"))).toBeGreaterThan(strokeWidth);
    expect(Number(kept.getAttribute("stroke-width"))).toBeGreaterThan(Number(cut.getAttribute("stroke-width")));
    // Both bands and the halo trace the very route the edge is drawn on.
    expect(cut.getAttribute("points")).toBe(halo.getAttribute("points"));
    expect(kept.getAttribute("points")).toBe(halo.getAttribute("points"));
  });

  it("grows the halo with the zoom, so it stays a margin around the ink at any scale", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const width = (zoom: number) => {
      const { container } = render(<InteractionOverlay bounds={null} marquee={null} snapBounds={null} viewport={{ x: 0, y: 0, zoom }} connectors={[{ id: "c", points, strokeWidth: 2 }]} />);
      return Number(container.querySelector(".connector-selection")!.getAttribute("stroke-width"));
    };
    expect(width(2)).toBeGreaterThan(width(1));
  });
});
