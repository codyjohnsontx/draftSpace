import { describe, expect, it } from "vitest";
import { createBoard, createRectangle } from "@/core/board/factory";
import { loadBoardDocument } from "@/features/persistence/load-board-document";

describe("stored board loading", () => {
  it("returns missing for an empty record", () => expect(loadBoardDocument("board", null)).toEqual({ kind: "missing" }));
  it("loads a current board without migration", () => { const board = createBoard(); expect(loadBoardDocument(board.id, board)).toEqual({ kind: "ready", board, migrated: false }); });
  it("migrates a version one rectangle board without mutating the raw record", () => {
    const current = createBoard();
    const rectangle = createRectangle({ x: 10, y: 20, width: 100, height: 60 });
    current.elementIds.push(rectangle.id); current.elements[rectangle.id] = rectangle;
    const raw = { ...current, schemaVersion: 1 };
    const result = loadBoardDocument(current.id, raw);
    expect(result).toEqual({ kind: "ready", board: { ...current, schemaVersion: 2 }, migrated: true });
    expect(raw.schemaVersion).toBe(1);
  });
  it("preserves invalid raw data and limits issue output", () => {
    const raw = { id: "damaged", fileFormat: "wrong", schemaVersion: 1 };
    const result = loadBoardDocument("damaged", raw);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") { expect(result.raw).toBe(raw); expect(result.issues.length).toBeLessThanOrEqual(3); }
  });
  it("separates unsupported future versions", () => {
    const raw = { id: "future", fileFormat: "draftspace/board", schemaVersion: 9 };
    expect(loadBoardDocument("future", raw)).toEqual({ kind: "unsupported-version", boardId: "future", raw, schemaVersion: 9 });
  });
});
