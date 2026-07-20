export type Point = { x: number; y: number };
export type Bounds = { x: number; y: number; width: number; height: number };
export type ElementId = string;
export type ShapeType = "rectangle" | "ellipse" | "diamond";

export type BaseShapeElement = {
  id: ElementId;
  type: ShapeType;
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
  boundTextId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RectangleElement = BaseShapeElement & {
  type: "rectangle";
  cornerRadius: number;
};

export type EllipseElement = BaseShapeElement & { type: "ellipse" };
export type DiamondElement = BaseShapeElement & { type: "diamond" };

export type CanvasElement = RectangleElement | EllipseElement | DiamondElement;
