import { afterEach, describe, expect, it } from "vitest";
import { boardSchema } from "@/schemas/board-schema";
import { createBenchmarkBoard, type BenchmarkElementCount, type BenchmarkLayout } from "@/features/performance/benchmark-fixtures";
import { median, percentile, summarizeSamples } from "@/features/performance/statistics";
import { getReport, initializePerformanceMonitor, recordPerformanceSample } from "@/features/performance/performance-monitor";
import { elementsContainedByBounds, hitTestElements } from "@/core/geometry/hit-testing";
import { intersectsBounds, worldViewportBounds } from "@/core/geometry/visibility";
import { createShape } from "@/core/board/factory";
import type { RectangleElement } from "@/core/elements/types";

const rectangle = (id: string, overrides: Partial<RectangleElement> = {}): RectangleElement => ({
  id, type: "rectangle", x: 0, y: 0, width: 100, height: 80, rotation: 0, groupIds: [], locked: false,
  hidden: false, opacity: 1, strokeColor: "#000", strokeWidth: 1, strokeStyle: "solid", fillColor: "#fff",
  fillStyle: "solid", roughness: 0, cornerRadius: 0, boundTextId: null,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

afterEach(() => initializePerformanceMonitor(""));

describe("benchmark fixtures", () => {
  const counts: BenchmarkElementCount[] = [100, 500, 1000];
  const layouts: BenchmarkLayout[] = ["all-visible", "distributed"];
  for (const elementCount of counts) for (const layout of layouts) {
    it(`creates a deterministic, valid ${elementCount} element ${layout} board`, () => {
      const first = createBenchmarkBoard({ elementCount, layout });
      const second = createBenchmarkBoard({ elementCount, layout });
      expect(first).toEqual(second);
      expect(first.elementIds).toHaveLength(elementCount);
      expect(Object.keys(first.elements)).toHaveLength(elementCount);
      expect(boardSchema.safeParse(first).success).toBe(true);
    });
  }

  it("uses compact and large-world layouts", () => {
    const compact = createBenchmarkBoard({ elementCount: 1000, layout: "all-visible" });
    const distributed = createBenchmarkBoard({ elementCount: 1000, layout: "distributed" });
    const compactLast = compact.elements[compact.elementIds.at(-1)!];
    const distributedLast = distributed.elements[distributed.elementIds.at(-1)!];
    expect(compactLast.y).toBeLessThan(720);
    for (const id of compact.elementIds) {
      const element = compact.elements[id];
      expect(element.x + element.width).toBeLessThanOrEqual(1280);
      expect(element.y + element.height).toBeLessThanOrEqual(720);
    }
    expect(distributedLast.y).toBeGreaterThan(10_000);
  });
});

describe("statistics", () => {
  it("calculates median and nearest-rank percentiles", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([9, 2, 5])).toBe(5);
    expect(percentile([1, 2, 3, 4, 100], .95)).toBe(100);
  });

  it("summarizes only the requested metric", () => {
    const summary = summarizeSamples("scene-render", [
      { name: "scene-render", durationMs: 2, elementCount: 100, timestamp: 1 },
      { name: "point-hit-test", durationMs: 40, elementCount: 100, timestamp: 2 },
      { name: "scene-render", durationMs: 4, elementCount: 100, timestamp: 3 },
    ]);
    expect(summary).toMatchObject({ sampleCount: 2, minimumMs: 2, medianMs: 3, p95Ms: 4, maximumMs: 4 });
  });
});

describe("performance monitor", () => {
  it("is inactive and exposes no bridge in ordinary sessions", () => {
    initializePerformanceMonitor("");
    recordPerformanceSample({ name: "scene-render", durationMs: 1, elementCount: 100 });
    expect(window.__draftspaceBenchmark).toBeUndefined();
  });

  it("activates only for valid fixtures and retains at most 500 samples", () => {
    expect(initializePerformanceMonitor("?benchmark=1&count=1000&layout=all-visible")).toBe(true);
    for (let index = 0; index < 505; index += 1) recordPerformanceSample({ name: "scene-render", durationMs: index, elementCount: 1000 });
    expect(window.__draftspaceBenchmark).toBeDefined();
    expect(getReport().summaries.find((summary) => summary.name === "scene-render")).toMatchObject({ sampleCount: 500, minimumMs: 5, maximumMs: 504 });
    window.__draftspaceBenchmark?.reset();
    expect(getReport().summaries.find((summary) => summary.name === "scene-render")?.sampleCount).toBe(0);
  });
});

describe("hit testing", () => {
  it("selects the highest eligible layer without copying the collection", () => {
    const elements = [rectangle("bottom"), rectangle("top")];
    expect(hitTestElements(elements, { x: 20, y: 20 }, 0)?.id).toBe("top");
    expect(elements.map((element) => element.id)).toEqual(["bottom", "top"]);
  });

  it("ignores hidden and locked elements", () => {
    expect(hitTestElements([rectangle("ok"), rectangle("locked", { locked: true }), rectangle("hidden", { hidden: true })], { x: 20, y: 20 }, 0)?.id).toBe("ok");
  });

  it("selects ellipses and diamonds only inside their visible silhouettes", () => {
    const ellipse = createShape("ellipse", { x: 0, y: 0, width: 100, height: 80 });
    const diamond = createShape("diamond", { x: 120, y: 0, width: 100, height: 80 });
    expect(hitTestElements([ellipse], { x: 5, y: 5 }, 0)).toBeNull();
    expect(hitTestElements([ellipse], { x: 50, y: 40 }, 0)?.type).toBe("ellipse");
    expect(hitTestElements([diamond], { x: 125, y: 5 }, 0)).toBeNull();
    expect(hitTestElements([diamond], { x: 170, y: 40 }, 0)?.type).toBe("diamond");
  });

  it("uses full containment for marquee selection", () => {
    const inside = rectangle("inside", { x: 10, y: 10, width: 20, height: 20 });
    const clipped = rectangle("clipped", { x: 90, y: 90, width: 20, height: 20 });
    expect(elementsContainedByBounds([inside, clipped], { x: 0, y: 0, width: 100, height: 100 }).map((element) => element.id)).toEqual(["inside"]);
  });
});

describe("visibility geometry", () => {
  it("converts screen dimensions to world bounds at negative coordinates and zoom", () => {
    expect(worldViewportBounds({ x: 200, y: 100, zoom: 2 }, { width: 800, height: 600 })).toEqual({ x: -100, y: -50, width: 400, height: 300 });
  });

  it("converts CSS overscan to world units and includes edge intersections", () => {
    expect(worldViewportBounds({ x: 0, y: 0, zoom: 2 }, { width: 800, height: 600 }, 64)).toEqual({ x: -32, y: -32, width: 464, height: 364 });
    expect(intersectsBounds({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 3, height: 3 })).toBe(true);
    expect(intersectsBounds({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 3, height: 3 })).toBe(false);
  });
});
