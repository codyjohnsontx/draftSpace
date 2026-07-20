import { describe, expect, it, vi } from "vitest";
import { shapePath } from "@/core/rendering/shape-path";

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
