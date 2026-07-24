import { beforeEach, describe, expect, it } from "vitest";
import { createBoard, createConnector, createRectangle, createShape } from "@/core/board/factory";
import { migrateStoredBoard } from "@/migrations/board-migrations";
import { boardSchema } from "@/schemas/board-schema";
import { applyBoardCommand } from "@/core/commands/apply-board-command";
import { parseBoardCommand } from "@/core/commands/board-command";
import { produce } from "immer";
import { useBoardStore } from "@/stores/board-store";
import type { BoardDocument } from "@/core/board/types";

function boardWithTwoShapes() {
  const board = createBoard();
  const a = createRectangle({ x: 0, y: 0, width: 100, height: 60 });
  const b = createRectangle({ x: 300, y: 0, width: 100, height: 60 });
  for (const element of [a, b]) { board.elementIds.push(element.id); board.elements[element.id] = element; }
  return { board, a, b };
}

describe("board migration to v3", () => {
  it("adds empty connector collections to a v2 board", () => {
    const { board } = boardWithTwoShapes();
    const v2 = JSON.parse(JSON.stringify({ ...board, schemaVersion: 2 })) as Record<string, unknown>;
    delete v2.connectorIds; delete v2.connectors;
    (Object.values(v2.elements as Record<string, Record<string, unknown>>)).forEach((element) => {
      delete element.nodeKind; delete element.layer; delete element.label;
    });
    const result = migrateStoredBoard(v2, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    const parsed = boardSchema.parse(result.value);
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.connectorIds).toEqual([]);
    expect(parsed.connectors).toEqual({});
    expect(Object.values(parsed.elements).map((element) => [element.nodeKind, element.layer, element.label])).toEqual([["plain", 0, ""], ["plain", 0, ""]]);
  });

  it("still rejects versions above the current one", () => {
    expect(migrateStoredBoard({ schemaVersion: 4 }, 4)).toEqual({ ok: false, reason: "unsupported-version", schemaVersion: 4 });
  });
});

describe("connector commands", () => {
  it("creates and deletes connectors through parseable commands", () => {
    const { board, a, b } = boardWithTwoShapes();
    const connector = createConnector({ elementId: a.id, port: "auto" }, { elementId: b.id, port: "auto" });
    const createCommand = parseBoardCommand({ type: "connectors.create", connectors: [JSON.parse(JSON.stringify(connector))] });
    expect(createCommand).not.toBeNull();
    const withConnector = produce(board, (draft) => { expect(applyBoardCommand(draft, createCommand!)).toBe(true); });
    expect(withConnector.connectorIds).toEqual([connector.id]);
    const deleteCommand = parseBoardCommand({ type: "connectors.delete", connectorIds: [connector.id] });
    const cleared = produce(withConnector, (draft) => { expect(applyBoardCommand(draft, deleteCommand!)).toBe(true); });
    expect(cleared.connectorIds).toEqual([]);
    expect(cleared.connectors).toEqual({});
  });

  it("refuses connectors whose endpoints are missing", () => {
    const { board, a } = boardWithTwoShapes();
    const connector = createConnector({ elementId: a.id, port: "auto" }, { elementId: "nope", port: "auto" });
    const next = produce(board, (draft) => {
      expect(applyBoardCommand(draft, { type: "connectors.create", connectors: [connector] })).toBe(false);
    });
    expect(next.connectorIds).toEqual([]);
  });

  it("updates connector styling with expected-value guards", () => {
    const { board, a, b } = boardWithTwoShapes();
    const connector = createConnector({ elementId: a.id, port: "auto" }, { elementId: b.id, port: "auto" });
    const seeded = produce(board, (draft) => { applyBoardCommand(draft, { type: "connectors.create", connectors: [connector] }); });
    const updated = produce(seeded, (draft) => {
      expect(applyBoardCommand(draft, { type: "connectors.update", updates: [{ connectorId: connector.id, patch: { kind: "async", label: "events" } }] })).toBe(true);
    });
    expect(updated.connectors[connector.id]).toMatchObject({ kind: "async", label: "events" });
    const guarded = produce(updated, (draft) => {
      expect(applyBoardCommand(draft, { type: "connectors.update", updates: [{ connectorId: connector.id, patch: { label: "other" }, expected: { label: "stale" } }] })).toBe(false);
    });
    expect(guarded.connectors[connector.id].label).toBe("events");
  });

  it("cascades connector deletion when an endpoint element is deleted", () => {
    const { board, a, b } = boardWithTwoShapes();
    const connector = createConnector({ elementId: a.id, port: "auto" }, { elementId: b.id, port: "auto" });
    const seeded = produce(board, (draft) => { applyBoardCommand(draft, { type: "connectors.create", connectors: [connector] }); });
    const afterDelete = produce(seeded, (draft) => {
      expect(applyBoardCommand(draft, { type: "elements.delete", elementIds: [a.id] })).toBe(true);
    });
    expect(afterDelete.elementIds).toEqual([b.id]);
    expect(afterDelete.connectorIds).toEqual([]);
    expect(afterDelete.connectors).toEqual({});
  });
});

describe("connector history through the board store", () => {
  beforeEach(() => {
    useBoardStore.getState().setBoard(createBoard() as BoardDocument);
  });

  it("restores cascaded connectors when a delete is undone, and removes them again on redo", () => {
    const store = useBoardStore.getState();
    const aId = store.createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
    const bId = useBoardStore.getState().createShape("rectangle", { x: 300, y: 0, width: 100, height: 60 })!;
    const connectorId = useBoardStore.getState().createConnector({ elementId: aId, port: "auto" }, { elementId: bId, port: "auto" })!;
    expect(connectorId).toBeTruthy();

    useBoardStore.getState().deleteElements([aId]);
    let board = useBoardStore.getState().board!;
    expect(board.elements[aId]).toBeUndefined();
    expect(board.connectorIds).toEqual([]);

    useBoardStore.getState().undo();
    board = useBoardStore.getState().board!;
    expect(board.elements[aId]).toBeDefined();
    expect(board.connectorIds).toEqual([connectorId]);
    expect(board.connectors[connectorId]).toMatchObject({ from: { elementId: aId }, to: { elementId: bId } });

    useBoardStore.getState().redo();
    board = useBoardStore.getState().board!;
    expect(board.elements[aId]).toBeUndefined();
    expect(board.connectorIds).toEqual([]);
  });

  it("undoes and redoes connector creation", () => {
    const store = useBoardStore.getState();
    const aId = store.createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
    const bId = useBoardStore.getState().createShape("ellipse", { x: 300, y: 0, width: 100, height: 60 })!;
    const connectorId = useBoardStore.getState().createConnector({ elementId: aId, port: "e" }, { elementId: bId, port: "w" }, "data")!;

    useBoardStore.getState().undo();
    expect(useBoardStore.getState().board!.connectorIds).toEqual([]);
    useBoardStore.getState().redo();
    const board = useBoardStore.getState().board!;
    expect(board.connectorIds).toEqual([connectorId]);
    expect(board.connectors[connectorId].kind).toBe("data");
  });

  it("keeps semantic node fields writable through element updates", () => {
    const store = useBoardStore.getState();
    const id = store.createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
    useBoardStore.getState().updateElements([{ elementId: id, patch: { nodeKind: "service", layer: 1, label: "Orders" } }], "Set node kind", "style");
    const element = useBoardStore.getState().board!.elements[id];
    expect(element).toMatchObject({ nodeKind: "service", layer: 1, label: "Orders" });
    expect(createShape("rectangle", { x: 0, y: 0, width: 10, height: 10 }, { nodeKind: "datastore" }).layer).toBe(0);
  });
});
