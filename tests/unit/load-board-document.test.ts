import { describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { loadBoardDocument } from "@/features/persistence/load-board-document";

describe("stored board loading", () => {
  it("returns missing for an empty record", () => expect(loadBoardDocument("board", null)).toEqual({ kind: "missing" }));
  it("loads a valid version one board", () => { const board = createBoard(); expect(loadBoardDocument(board.id, board)).toEqual({ kind: "ready", board }); });
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
