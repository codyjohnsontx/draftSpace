import { z } from "zod";

const finite = z.number().finite();
const color = z.string().min(1).max(64);

export const rectangleSchema = z.object({
  id: z.string().min(1),
  type: z.literal("rectangle"),
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
  cornerRadius: finite.nonnegative(),
  boundTextId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const boardSchema = z.object({
  fileFormat: z.literal("draftspace/board"),
  schemaVersion: z.literal(1),
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
  elements: z.record(z.string(), rectangleSchema),
}).superRefine((board, ctx) => {
  const ids = new Set(board.elementIds);
  if (ids.size !== board.elementIds.length) ctx.addIssue({ code: "custom", message: "Element order contains duplicate IDs" });
  for (const id of board.elementIds) if (!board.elements[id]) ctx.addIssue({ code: "custom", message: `Missing element ${id}` });
  for (const id of Object.keys(board.elements)) if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `Unordered element ${id}` });
});
