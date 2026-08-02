import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement, Connector, ConnectorMutablePatch } from "@/core/elements/types";
import { z } from "zod";
import { canvasElementSchema, connectorSchema } from "@/schemas/board-schema";
import { newId } from "@/lib/ids/new-id";

export type ElementMutablePatch = Partial<Pick<CanvasElement,
  | "x" | "y" | "width" | "height" | "rotation" | "groupIds" | "locked" | "hidden"
  | "opacity" | "strokeColor" | "strokeWidth" | "strokeStyle" | "fillColor" | "fillStyle"
  | "roughness" | "boundTextId" | "nodeKind" | "layer" | "label"
>> & { cornerRadius?: number };

export type BoardUpdatePatch = {
  name?: string;
  preferences?: Partial<BoardDocument["preferences"]>;
};

export type BoardCommand =
  // elements.create optionally restores connectors so undoing a cascade delete is one command.
  | { type: "elements.create"; elements: CanvasElement[]; insertionIndexes?: number[]; connectors?: Connector[]; connectorInsertionIndexes?: number[] }
  // elements.delete cascades to connectors referencing the deleted elements.
  | { type: "elements.delete"; elementIds: string[]; expectedElements?: Record<string, CanvasElement> }
  | { type: "elements.update"; updates: Array<{ elementId: string; patch: ElementMutablePatch; expected?: ElementMutablePatch }> }
  | { type: "connectors.create"; connectors: Connector[]; insertionIndexes?: number[] }
  | { type: "connectors.delete"; connectorIds: string[]; expectedConnectors?: Record<string, Connector> }
  | { type: "connectors.update"; updates: Array<{ connectorId: string; patch: ConnectorMutablePatch; expected?: ConnectorMutablePatch }> }
  | { type: "board.update"; patch: BoardUpdatePatch; expected?: BoardUpdatePatch };

export type BoardCommandIntent =
  | "create" | "delete" | "move" | "resize" | "rotate" | "style"
  | "duplicate" | "paste" | "rename" | "preferences" | "undo" | "redo";

export type BoardCommandMetadata = {
  commandId: string;
  actorId: string;
  label: string;
  intent: BoardCommandIntent;
};

let localActorId = () => "local";
let localCommandsAllowed = () => true;
export const setLocalActorIdProvider = (provider: () => string) => { localActorId = provider; };
export const getLocalActorId = () => localActorId();
export const setLocalCommandAuthorizationProvider = (provider: () => boolean) => { localCommandsAllowed = provider; };
export const canDispatchLocalCommands = () => localCommandsAllowed();

export const localCommandMetadata = (label: string, intent: BoardCommandIntent): BoardCommandMetadata => ({
  commandId: newId(),
  actorId: localActorId(),
  label,
  intent,
});

const mutablePatchSchema = z.strictObject({
  x: z.number().finite().optional(), y: z.number().finite().optional(), width: z.number().finite().nonnegative().optional(), height: z.number().finite().nonnegative().optional(),
  rotation: z.number().finite().optional(), groupIds: z.array(z.string()).optional(), locked: z.boolean().optional(), hidden: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(), strokeColor: z.string().min(1).max(64).optional(), strokeWidth: z.number().positive().finite().optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(), fillColor: z.string().min(1).max(64).nullable().optional(), fillStyle: z.enum(["solid", "hachure"]).optional(),
  roughness: z.number().min(0).max(2).optional(), boundTextId: z.string().nullable().optional(), cornerRadius: z.number().finite().nonnegative().optional(),
  nodeKind: z.enum(["plain", "service", "datastore", "queue", "actor", "decision", "boundary"]).optional(),
  layer: z.number().int().min(0).max(8).optional(), label: z.string().max(120).optional(),
});

const connectorPatchSchema = z.strictObject({
  kind: z.enum(["sync", "async", "data"]).optional(), label: z.string().max(120).nullable().optional(),
  strokeColor: z.string().min(1).max(64).optional(), strokeWidth: z.number().positive().finite().optional(), locked: z.boolean().optional(),
});

const boardPreferencesPatchSchema = z.object({
  backgroundPattern: z.enum(["dots", "grid", "none"]).optional(),
  gridSize: z.number().positive().max(500).optional(),
  snapToGrid: z.boolean().optional(),
  restoreViewport: z.boolean().optional(),
});

const boardCommandSchemaDefinition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("elements.create"), elements: z.array(canvasElementSchema).max(1000), insertionIndexes: z.array(z.number().int().nonnegative()).optional(), connectors: z.array(connectorSchema).max(1000).optional(), connectorInsertionIndexes: z.array(z.number().int().nonnegative()).optional() }),
  z.object({ type: z.literal("elements.delete"), elementIds: z.array(z.string()).max(1000), expectedElements: z.record(z.string(), canvasElementSchema).optional() }),
  z.object({ type: z.literal("elements.update"), updates: z.array(z.object({ elementId: z.string(), patch: mutablePatchSchema, expected: mutablePatchSchema.optional() })).max(1000) }),
  z.object({ type: z.literal("connectors.create"), connectors: z.array(connectorSchema).max(1000), insertionIndexes: z.array(z.number().int().nonnegative()).optional() }),
  z.object({ type: z.literal("connectors.delete"), connectorIds: z.array(z.string()).max(1000), expectedConnectors: z.record(z.string(), connectorSchema).optional() }),
  z.object({ type: z.literal("connectors.update"), updates: z.array(z.object({ connectorId: z.string(), patch: connectorPatchSchema, expected: connectorPatchSchema.optional() })).max(1000) }),
  z.object({ type: z.literal("board.update"), patch: z.object({ name: z.string().optional(), preferences: boardPreferencesPatchSchema.optional() }), expected: z.object({ name: z.string().optional(), preferences: boardPreferencesPatchSchema.optional() }).optional() }),
]);
export const boardCommandSchema: z.ZodType<BoardCommand> = boardCommandSchemaDefinition;

export function parseBoardCommand(value: unknown): BoardCommand | null {
  const result = boardCommandSchema.safeParse(value);
  return result.success ? result.data : null;
}
