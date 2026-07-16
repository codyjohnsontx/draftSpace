import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen, zoomAt } from "@/core/geometry/coordinates";

describe("coordinate conversion", () => {
  it("round trips between world and screen space", () => {
    const viewport = { x: 120, y: -40, zoom: 1.75 }; const world = { x: 50, y: 90 };
    expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
  });
  it("keeps the world point beneath the pointer fixed during zoom", () => {
    const pointer = { x: 420, y: 260 }; const before = { x: 90, y: 40, zoom: 1 };
    const world = screenToWorld(pointer, before); const after = zoomAt(before, pointer, 2.5);
    expect(screenToWorld(pointer, after)).toEqual(world);
  });
  it("clamps zoom", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBe(8);
  });
});
