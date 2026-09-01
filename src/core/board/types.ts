import type { CanvasElement, Connector, ConnectorId, ElementId } from "@/core/elements/types";

export type Viewport = { x: number; y: number; zoom: number };

export type BoardDocument = {
  fileFormat: "draftspace/board";
  schemaVersion: 3;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Identity of this exact document state, replaced by every mutation. `updatedAt` cannot serve:
   * it is a millisecond timestamp, so two mutations inside one tick share it, and a tab comparing
   * against it reads a draft it has not saved as one storage holds. See `stored-board-stamp.ts`.
   */
  stateId: string;
  viewport: Viewport;
  preferences: {
    backgroundPattern: "dots" | "grid" | "none";
    gridSize: number;
    snapToGrid: boolean;
    restoreViewport: boolean;
  };
  elementIds: ElementId[];
  elements: Record<ElementId, CanvasElement>;
  connectorIds: ConnectorId[];
  connectors: Record<ConnectorId, Connector>;
};

export type BoardSummary = Pick<BoardDocument, "id" | "name" | "createdAt" | "updatedAt"> & {
  elementCount: number;
};
