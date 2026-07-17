import { describe, expect, it } from "vitest";
import { classifyWheelGesture } from "@/core/interaction/wheel";

describe("wheel gesture classification", () => {
  it("treats pinch gestures as zoom", () => expect(classifyWheelGesture({ ctrlKey: true, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 4 })).toBe("zoom"));
  it("treats precise two-axis trackpad input as pan", () => expect(classifyWheelGesture({ ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 6.4, deltaY: 9.2 })).toBe("pan"));
  it("treats a mouse wheel notch as zoom", () => expect(classifyWheelGesture({ ctrlKey: false, metaKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe("zoom"));
});
