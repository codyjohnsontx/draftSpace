import { z } from "zod";

const finite = z.number().finite();
const color = z.string().min(1).max(64);

const baseShapeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["rectangle", "ellipse", "diamond"]),
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

type OrderedBoard = { elementIds: string[]; elements: Record<string, unknown> };

const validateElementOrder = (board: OrderedBoard, ctx: z.RefinementCtx) => {
  const ids = new Set(board.elementIds);
  if (ids.size !== board.elementIds.length) ctx.addIssue({ code: "custom", message: "Element order contains duplicate IDs" });
  for (const id of board.elementIds) if (!Object.prototype.hasOwnProperty.call(board.elements, id)) ctx.addIssue({ code: "custom", message: `Missing element ${id}` });
  for (const id of Object.keys(board.elements)) if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `Unordered element ${id}` });
};

export const boardV1Schema = z.object({
  ...boardFields,
  schemaVersion: z.literal(1),
  elements: z.record(z.string(), rectangleSchema),
}).superRefine(validateElementOrder);

export const boardSchema = z.object({
  ...boardFields,
  schemaVersion: z.literal(2),
  elements: z.record(z.string(), canvasElementSchema),
}).superRefine(validateElementOrder);
