import { describe, expect, it } from "vitest";
import { containsBounds, creationBounds, normalizeBounds, selectionBounds } from "@/core/geometry/bounds";
import { createRectangle } from "@/core/board/factory";
import { resizedBounds, scaleElements } from "@/core/geometry/resize";
import { snapBoundsToGrid, snappedMoveDelta } from "@/core/geometry/snapping";

describe("geometry", () => {
  it("normalizes reverse drags", () => expect(normalizeBounds({ x: 100, y: 80 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, width: 80, height: 50 }));
  it("combines square and center creation modifiers", () => expect(creationBounds({ x: 50, y: 50 }, { x: 70, y: 60 }, true, true)).toEqual({ x: 30, y: 30, width: 40, height: 40 }));
  it("tests full containment", () => expect(containsBounds({ x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 20, height: 20 })).toBe(true));
  it("calculates selection bounds", () => {
    const a = createRectangle({ x: 10, y: 20, width: 40, height: 50 }); const b = createRectangle({ x: 100, y: 80, width: 20, height: 30 });
    expect(selectionBounds([a, b])).toEqual({ x: 10, y: 20, width: 110, height: 90 });
  });
  it("enforces minimum resizing dimensions", () => expect(resizedBounds({ x: 0, y: 0, width: 100, height: 60 }, "w", { x: 200, y: 0 })).toEqual({ x: 84, y: 0, width: 16, height: 60 }));
  it("resizes from the center with Alt", () => expect(resizedBounds({ x: 20, y: 20, width: 100, height: 60 }, "e", { x: 20, y: 0 }, { fromCenter: true })).toEqual({ x: 0, y: 20, width: 140, height: 60 }));
  it("preserves aspect ratio with Shift", () => expect(resizedBounds({ x: 0, y: 0, width: 100, height: 50 }, "se", { x: 50, y: 10 }, { preserveAspect: true })).toEqual({ x: 0, y: 0, width: 150, height: 75 }));
  it("preserves relative layout during group scaling", () => {
    const a = createRectangle({ x: 0, y: 0, width: 20, height: 20 }); const b = createRectangle({ x: 80, y: 80, width: 20, height: 20 });
    const scaled = scaleElements([a, b], { x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 200, height: 200 });
    expect(scaled[1].x).toBe(170); expect(scaled[1].y).toBe(170);
  });
  it("snaps previews and movement to the same grid", () => {
    expect(snapBoundsToGrid({ x: 13, y: 29, width: 91, height: 49 }, 20)).toEqual({ x: 20, y: 20, width: 100, height: 40 });
    expect(snappedMoveDelta({ x: 13, y: 29 }, { x: 22, y: 25 }, 20)).toEqual({ x: 27, y: 31 });
  });
});
