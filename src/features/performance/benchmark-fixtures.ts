import type { BoardDocument } from "@/core/board/types";
import type { RectangleElement } from "@/core/elements/types";

export type BenchmarkElementCount = 100 | 500 | 1000;
export type BenchmarkLayout = "all-visible" | "distributed";
export interface BenchmarkFixtureOptions { elementCount: BenchmarkElementCount; layout: BenchmarkLayout }

const TIMESTAMP = "2026-01-15T12:00:00.000Z";
const ALL_VISIBLE_VIEWPORT_WIDTH = 1280;
const ALL_VISIBLE_PADDING = 24;
const ALL_VISIBLE_CELL_WIDTH = 30;
const ALL_VISIBLE_ELEMENT_WIDTH = 24;
const ALL_VISIBLE_COLUMNS = Math.floor(
  (ALL_VISIBLE_VIEWPORT_WIDTH - 2 * ALL_VISIBLE_PADDING - ALL_VISIBLE_ELEMENT_WIDTH) / ALL_VISIBLE_CELL_WIDTH,
) + 1;

export function benchmarkBoardId(options: BenchmarkFixtureOptions): string {
  return `benchmark-board-${options.elementCount}-${options.layout}`;
}

export function createBenchmarkBoard(options: BenchmarkFixtureOptions): BoardDocument {
  const columns = options.layout === "all-visible" ? ALL_VISIBLE_COLUMNS : 25;
  const cellWidth = options.layout === "all-visible" ? ALL_VISIBLE_CELL_WIDTH : 440;
  const cellHeight = options.layout === "all-visible" ? 24 : 320;
  const elementWidth = options.layout === "all-visible" ? ALL_VISIBLE_ELEMENT_WIDTH : 160;
  const elementHeight = options.layout === "all-visible" ? 18 : 100;
  const elements: Record<string, RectangleElement> = {};
  const elementIds: string[] = [];
  for (let index = 0; index < options.elementCount; index += 1) {
    const id = `benchmark-element-${String(index + 1).padStart(4, "0")}`;
    const column = index % columns; const row = Math.floor(index / columns);
    elementIds.push(id);
    elements[id] = {
      id, type: "rectangle", nodeKind: "plain", layer: 0, label: "",
      x: ALL_VISIBLE_PADDING + column * cellWidth, y: ALL_VISIBLE_PADDING + row * cellHeight,
      width: elementWidth, height: elementHeight, rotation: 0, groupIds: [], locked: false, hidden: false,
      opacity: 1, strokeColor: "#292724", strokeWidth: 1, strokeStyle: "solid", fillColor: "#f0ded4",
      fillStyle: "solid", roughness: 0, cornerRadius: options.layout === "all-visible" ? 3 : 10,
      boundTextId: null, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
    };
  }
  return {
    fileFormat: "draftspace/board", schemaVersion: 3, id: benchmarkBoardId(options), name: `Benchmark ${options.elementCount} ${options.layout}`,
    createdAt: TIMESTAMP, updatedAt: TIMESTAMP, viewport: { x: 0, y: 0, zoom: 1 },
    preferences: { backgroundPattern: "none", gridSize: 20, snapToGrid: false, restoreViewport: true }, elementIds, elements,
    connectorIds: [], connectors: {},
  };
}
