import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export type ParticipantRole = "host" | "editor" | "viewer";

export const participantProfileSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const viewportSchema = z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(.1).max(8) });

export const presenceSchema = z.object({
  cursor: pointSchema.nullable(),
  selectedElementIds: z.array(z.string()).max(250),
  selectionCount: z.number().int().nonnegative(),
  activeTool: z.string().min(1).max(32),
  presentingViewport: viewportSchema.optional(),
});
export type PresencePayload = z.infer<typeof presenceSchema>;

export const commandProposalSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  commandId: z.string().min(1).max(128),
  boardId: z.string().min(1).max(128),
  actorId: z.string().min(1).max(128),
  baseRevision: z.number().int().nonnegative(),
  command: z.unknown(),
  metadata: z.object({ label: z.string().min(1).max(120), intent: z.enum(["create", "delete", "move", "resize", "rotate", "style", "duplicate", "paste", "rename", "preferences", "undo", "redo"]) }),
});
export type CommandProposal = z.infer<typeof commandProposalSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), protocolVersion: z.literal(PROTOCOL_VERSION), mode: z.enum(["host", "guest"]), token: z.string().max(512).optional(), profile: participantProfileSchema }),
  z.object({ type: z.literal("host.admit"), participantId: z.string().min(1).max(128), role: z.enum(["viewer", "editor"]) }),
  z.object({ type: z.literal("host.reject"), participantId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("host.role"), participantId: z.string().min(1).max(128), role: z.enum(["viewer", "editor"]) }),
  z.object({ type: z.literal("host.kick"), participantId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("host.end") }),
  z.object({ type: z.literal("presence.update"), presence: presenceSchema }),
  z.object({ type: z.literal("command.propose"), proposal: commandProposalSchema }),
  z.object({ type: z.literal("command.accept"), participantId: z.string(), proposal: commandProposalSchema }),
  z.object({ type: z.literal("command.reject"), participantId: z.string().min(1).max(128), commandId: z.string().min(1).max(128), reason: z.string().max(200) }),
  z.object({ type: z.literal("snapshot.request") }),
  z.object({ type: z.literal("snapshot.response"), participantId: z.string(), board: z.unknown(), roomRevision: z.number().int().nonnegative() }),
  z.object({ type: z.literal("room.leave") }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ParticipantSummary = ParticipantProfile & { participantId: string; role: ParticipantRole };

const participantSummarySchema = participantProfileSchema.extend({ participantId: z.string().min(1).max(128), role: z.enum(["host", "editor", "viewer"]) });

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connection.ready") }),
  z.object({ type: z.literal("hello.ack"), participantId: z.string(), role: z.enum(["host", "editor", "viewer", "pending"]), roomRevision: z.number().int().nonnegative(), reconnectToken: z.string().optional() }),
  z.object({ type: z.literal("join.request"), participant: participantSummarySchema }),
  z.object({ type: z.literal("room.admitted"), role: z.enum(["editor", "viewer"]), reconnectToken: z.string() }),
  z.object({ type: z.literal("room.rejected") }),
  z.object({ type: z.literal("participant.joined"), participant: participantSummarySchema }),
  z.object({ type: z.literal("participant.left"), participantId: z.string() }),
  z.object({ type: z.literal("participant.role"), participantId: z.string(), role: z.enum(["editor", "viewer"]) }),
  z.object({ type: z.literal("participant.kicked") }),
  z.object({ type: z.literal("presence.update"), participantId: z.string(), presence: presenceSchema }),
  z.object({ type: z.literal("command.propose"), participantId: z.string(), proposal: commandProposalSchema }),
  z.object({ type: z.literal("command.accept"), participantId: z.string(), proposal: commandProposalSchema, roomRevision: z.number().int().nonnegative(), appliedAt: z.string() }),
  z.object({ type: z.literal("command.reject"), commandId: z.string(), reason: z.string() }),
  z.object({ type: z.literal("snapshot.request"), participantId: z.string() }),
  z.object({ type: z.literal("snapshot.response"), board: z.unknown(), roomRevision: z.number().int().nonnegative() }),
  z.object({ type: z.literal("host.away"), deadline: z.number() }),
  z.object({ type: z.literal("host.returned") }),
  z.object({ type: z.literal("room.ended"), reason: z.enum(["host-ended", "host-timeout"]) }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(value: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseServerMessage(value: unknown): ServerMessage | null {
  const result = serverMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
