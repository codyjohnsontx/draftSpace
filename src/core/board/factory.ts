import type { BoardDocument } from "./types";
import type { Bounds, RectangleElement } from "@/core/elements/types";

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

export function createBoard(name = "Untitled board"): BoardDocument {
  const timestamp = now();
  return {
    fileFormat: "draftspace/board",
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    viewport: { x: 0, y: 0, zoom: 1 },
    preferences: { backgroundPattern: "dots", gridSize: 20, snapToGrid: false, restoreViewport: true },
    elementIds: [],
    elements: {},
  };
}

export function createRectangle(bounds: Bounds): RectangleElement {
  const timestamp = now();
  return {
    id: newId(), type: "rectangle", ...bounds, rotation: 0, groupIds: [], locked: false,
    hidden: false, opacity: 1, strokeColor: "#292724", strokeWidth: 2,
    strokeStyle: "solid", fillColor: "#f4eadf", fillStyle: "solid", roughness: 0,
    cornerRadius: 10, boundTextId: null, createdAt: timestamp, updatedAt: timestamp,
  };
}
