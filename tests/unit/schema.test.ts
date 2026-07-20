import { describe, expect, it } from "vitest";
import { createBoard, createRectangle, createShape } from "@/core/board/factory";
import { boardSchema } from "@/schemas/board-schema";

describe("board schema", () => {
  it("round trips a valid board", () => {
    const board = createBoard(); const element = createRectangle({ x: 1, y: 2, width: 100, height: 60 }); board.elementIds.push(element.id); board.elements[element.id] = element;
    expect(boardSchema.parse(JSON.parse(JSON.stringify(board)))).toEqual(board);
  });
  it("accepts every supported shape with shared defaults", () => {
    const board = createBoard();
    const shapes = (["rectangle", "ellipse", "diamond"] as const).map((type, index) => createShape(type, { x: index * 120, y: 2, width: 100, height: 60 }));
    for (const shape of shapes) { board.elementIds.push(shape.id); board.elements[shape.id] = shape; }
    expect(boardSchema.parse(board)).toEqual(board);
    expect(shapes.map(({ type, fillColor, strokeColor, strokeWidth }) => ({ type, fillColor, strokeColor, strokeWidth }))).toEqual([
      { type: "rectangle", fillColor: "#f4eadf", strokeColor: "#292724", strokeWidth: 2 },
      { type: "ellipse", fillColor: "#f4eadf", strokeColor: "#292724", strokeWidth: 2 },
      { type: "diamond", fillColor: "#f4eadf", strokeColor: "#292724", strokeWidth: 2 },
    ]);
  });
  it("rejects missing ordered elements", () => { const board = createBoard(); board.elementIds.push("missing"); expect(boardSchema.safeParse(board).success).toBe(false); });
  it("rejects unsupported versions", () => expect(boardSchema.safeParse({ ...createBoard(), schemaVersion: 3 }).success).toBe(false));
});
