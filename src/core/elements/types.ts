export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type ElementId = string;

export type RectangleElement = {
  id: ElementId;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  groupIds: string[];
  locked: boolean;
  hidden: boolean;
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: "solid" | "dashed" | "dotted";
  fillColor: string | null;
  fillStyle: "solid" | "hachure";
  roughness: number;
  cornerRadius: number;
  boundTextId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanvasElement = RectangleElement;
