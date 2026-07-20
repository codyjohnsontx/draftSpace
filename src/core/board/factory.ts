import type { BoardDocument } from "./types";
import type { BaseShapeElement, Bounds, CanvasElement, RectangleElement, ShapeType } from "@/core/elements/types";
import { newId } from "@/lib/ids/new-id";

export const now = () => new Date().toISOString();

export function createBoard(name = "Untitled board"): BoardDocument {
  const timestamp = now();
  return {
    fileFormat: "draftspace/board",
    schemaVersion: 2,
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

export { newId };

export function createShape(type: ShapeType, bounds: Bounds): CanvasElement {
  const timestamp = now();
  const shape: Omit<BaseShapeElement, "type"> = {
    id: newId(), ...bounds, rotation: 0, groupIds: [], locked: false,
    hidden: false, opacity: 1, strokeColor: "#292724", strokeWidth: 2,
    strokeStyle: "solid", fillColor: "#f4eadf", fillStyle: "solid", roughness: 0,
    boundTextId: null, createdAt: timestamp, updatedAt: timestamp,
  };
  if (type === "rectangle") return { ...shape, type, cornerRadius: 10 };
  if (type === "ellipse") return { ...shape, type };
  return { ...shape, type };
}

export const createRectangle = (bounds: Bounds): RectangleElement => createShape("rectangle", bounds) as RectangleElement;
