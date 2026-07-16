import { describe, expect, it } from "vitest";
import { createBoard, createRectangle } from "@/core/board/factory";
import { boardSchema } from "@/schemas/board-schema";

describe("board schema", () => {
  it("round trips a valid board", () => {
    const board = createBoard(); const element = createRectangle({ x: 1, y: 2, width: 100, height: 60 }); board.elementIds.push(element.id); board.elements[element.id] = element;
    expect(boardSchema.parse(JSON.parse(JSON.stringify(board)))).toEqual(board);
  });
  it("rejects missing ordered elements", () => { const board = createBoard(); board.elementIds.push("missing"); expect(boardSchema.safeParse(board).success).toBe(false); });
  it("rejects unsupported versions", () => expect(boardSchema.safeParse({ ...createBoard(), schemaVersion: 2 }).success).toBe(false));
});
