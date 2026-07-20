import { describe, expect, it, vi } from "vitest";
import { shapePath } from "@/core/rendering/shape-path";
import { createBoard } from "@/core/board/factory";
import { useBoardStore } from "@/stores/board-store";

function contextStub() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    roundRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("shape paths", () => {
  it("builds an ellipse from the center of its bounds", () => {
    const context = contextStub();
    shapePath(context, "ellipse", { x: 10, y: 20, width: 100, height: 60 });
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.ellipse).toHaveBeenCalledWith(60, 50, 50, 30, 0, 0, Math.PI * 2);
  });

  it("builds a closed diamond through each edge midpoint", () => {
    const context = contextStub();
    shapePath(context, "diamond", { x: 10, y: 20, width: 100, height: 60 });
    expect(context.moveTo).toHaveBeenCalledWith(60, 20);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 110, 50);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 60, 80);
    expect(context.lineTo).toHaveBeenNthCalledWith(3, 10, 50);
    expect(context.closePath).toHaveBeenCalledOnce();
  });
});

describe("shape creation", () => {
  it("returns null without a loaded board and an ID after successful creation", () => {
    useBoardStore.setState({ board: null });
    expect(useBoardStore.getState().createShape("ellipse", { x: 0, y: 0, width: 100, height: 60 })).toBeNull();

    useBoardStore.getState().setBoard(createBoard());
    const id = useBoardStore.getState().createShape("ellipse", { x: 0, y: 0, width: 100, height: 60 });
    expect(id).toEqual(expect.any(String));
    expect(useBoardStore.getState().board?.elements[id!]?.type).toBe("ellipse");
  });
});
