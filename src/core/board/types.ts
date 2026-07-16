import type { CanvasElement, ElementId } from "@/core/elements/types";

export type Viewport = { x: number; y: number; zoom: number };

export type BoardDocument = {
  fileFormat: "draftspace/board";
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  viewport: Viewport;
  preferences: {
    backgroundPattern: "dots" | "grid" | "none";
    gridSize: number;
    snapToGrid: boolean;
    restoreViewport: boolean;
  };
  elementIds: ElementId[];
  elements: Record<ElementId, CanvasElement>;
};

export type BoardSummary = Pick<BoardDocument, "id" | "name" | "createdAt" | "updatedAt"> & {
  elementCount: number;
};
