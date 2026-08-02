import type { BoardDocument } from "./types";
import type { BaseShapeElement, Bounds, CanvasElement, Connector, ConnectorEndpoint, ConnectorKind, NodeKind, RectangleElement, ShapeType } from "@/core/elements/types";
import { newId } from "@/lib/ids/new-id";

export const now = () => new Date().toISOString();

/** Architectural tier each node kind starts on: 0 = data, 1 = services, 2 = edge/clients. */
export const DEFAULT_LAYER_BY_KIND: Record<NodeKind, number> = {
  plain: 0,
  boundary: 0,
  datastore: 0,
  queue: 0,
  service: 1,
  decision: 1,
  actor: 2,
};

export function createBoard(name = "Untitled board"): BoardDocument {
  const timestamp = now();
  return {
    fileFormat: "draftspace/board",
    schemaVersion: 3,
    id: newId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    viewport: { x: 0, y: 0, zoom: 1 },
    preferences: { backgroundPattern: "dots", gridSize: 20, snapToGrid: false, restoreViewport: true },
    elementIds: [],
    elements: {},
    connectorIds: [],
    connectors: {},
  };
}

export { newId };

export function createShape(type: ShapeType, bounds: Bounds, options: { nodeKind?: NodeKind; label?: string } = {}): CanvasElement {
  const timestamp = now();
  const nodeKind = options.nodeKind ?? "plain";
  const shape: Omit<BaseShapeElement, "type"> = {
    id: newId(), nodeKind, layer: DEFAULT_LAYER_BY_KIND[nodeKind], label: options.label ?? "",
    ...bounds, rotation: 0, groupIds: [], locked: false,
    hidden: false, opacity: 1, strokeColor: "#292724", strokeWidth: 2,
    strokeStyle: "solid", fillColor: "#f4eadf", fillStyle: "solid", roughness: 0,
    boundTextId: null, createdAt: timestamp, updatedAt: timestamp,
  };
  if (type === "rectangle") return { ...shape, type, cornerRadius: 10 };
  if (type === "ellipse") return { ...shape, type };
  return { ...shape, type };
}

export const createRectangle = (bounds: Bounds): RectangleElement => createShape("rectangle", bounds) as RectangleElement;

export function createConnector(from: ConnectorEndpoint, to: ConnectorEndpoint, options: { kind?: ConnectorKind; label?: string | null } = {}): Connector {
  const timestamp = now();
  return {
    id: newId(),
    from,
    to,
    kind: options.kind ?? "sync",
    label: options.label ?? null,
    strokeColor: "#b85f3f",
    strokeWidth: 2,
    locked: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
