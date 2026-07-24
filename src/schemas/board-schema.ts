import { z } from "zod";

const finite = z.number().finite();
const color = z.string().min(1).max(64);

// New semantic fields default so v1/v2 documents parse without rewriting elements.
const baseShapeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["rectangle", "ellipse", "diamond"]),
  nodeKind: z.enum(["plain", "service", "datastore", "queue", "actor", "decision", "boundary"]).default("plain"),
  layer: z.number().int().min(0).max(8).default(0),
  label: z.string().max(120).default(""),
  x: finite,
  y: finite,
  width: finite.nonnegative(),
  height: finite.nonnegative(),
  rotation: finite,
  groupIds: z.array(z.string()),
  locked: z.boolean(),
  hidden: z.boolean(),
  opacity: z.number().min(0).max(1),
  strokeColor: color,
  strokeWidth: finite.positive(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  fillColor: color.nullable(),
  fillStyle: z.enum(["solid", "hachure"]),
  roughness: z.number().min(0).max(2),
  boundTextId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const rectangleSchema = baseShapeSchema.extend({
  type: z.literal("rectangle"),
  cornerRadius: finite.nonnegative(),
});

export const ellipseSchema = baseShapeSchema.extend({ type: z.literal("ellipse") });
export const diamondSchema = baseShapeSchema.extend({ type: z.literal("diamond") });
export const canvasElementSchema = z.discriminatedUnion("type", [rectangleSchema, ellipseSchema, diamondSchema]);

const connectorEndpointSchema = z.object({
  elementId: z.string().min(1),
  port: z.enum(["n", "e", "s", "w", "auto"]),
});

export const connectorSchema = z.object({
  id: z.string().min(1),
  from: connectorEndpointSchema,
  to: connectorEndpointSchema,
  kind: z.enum(["sync", "async", "data"]),
  label: z.string().max(120).nullable(),
  strokeColor: color,
  strokeWidth: finite.positive(),
  locked: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const boardFields = {
  fileFormat: z.literal("draftspace/board"),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  viewport: z.object({ x: finite, y: finite, zoom: z.number().min(0.1).max(8) }),
  preferences: z.object({
    backgroundPattern: z.enum(["dots", "grid", "none"]),
    gridSize: z.number().positive().max(500),
    snapToGrid: z.boolean(),
    restoreViewport: z.boolean(),
  }),
  elementIds: z.array(z.string()),
};

type OrderedCollection = { orderIds: string[]; items: Record<string, unknown>; noun: string };

const validateOrder = ({ orderIds, items, noun }: OrderedCollection, ctx: z.RefinementCtx) => {
  const ids = new Set(orderIds);
  if (ids.size !== orderIds.length) ctx.addIssue({ code: "custom", message: `${noun} order contains duplicate IDs` });
  for (const id of orderIds) if (!Object.prototype.hasOwnProperty.call(items, id)) ctx.addIssue({ code: "custom", message: `Missing ${noun.toLowerCase()} ${id}` });
  for (const id of Object.keys(items)) if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `Unordered ${noun.toLowerCase()} ${id}` });
};

type OrderedBoard = { elementIds: string[]; elements: Record<string, unknown> };

const validateElementOrder = (board: OrderedBoard, ctx: z.RefinementCtx) =>
  validateOrder({ orderIds: board.elementIds, items: board.elements, noun: "Element" }, ctx);

export const boardV1Schema = z.object({
  ...boardFields,
  schemaVersion: z.literal(1),
  elements: z.record(z.string(), rectangleSchema),
}).superRefine(validateElementOrder);

export const boardV2Schema = z.object({
  ...boardFields,
  schemaVersion: z.literal(2),
  elements: z.record(z.string(), canvasElementSchema),
}).superRefine(validateElementOrder);

export const boardSchema = z.object({
  ...boardFields,
  schemaVersion: z.literal(3),
  elements: z.record(z.string(), canvasElementSchema),
  connectorIds: z.array(z.string()),
  connectors: z.record(z.string(), connectorSchema),
}).superRefine((board, ctx) => {
  validateElementOrder(board, ctx);
  validateOrder({ orderIds: board.connectorIds, items: board.connectors, noun: "Connector" }, ctx);
  // Every connector endpoint must reference a real element.
  for (const id of board.connectorIds) {
    const connector = board.connectors[id];
    if (!connector) continue;
    for (const endpoint of [connector.from, connector.to]) {
      if (!Object.prototype.hasOwnProperty.call(board.elements, endpoint.elementId)) {
        ctx.addIssue({ code: "custom", message: `Connector ${id} references missing element ${endpoint.elementId}` });
      }
    }
  }
});
