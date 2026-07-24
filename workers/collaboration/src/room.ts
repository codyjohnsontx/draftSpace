import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, type ParticipantProfile, type ParticipantRole, type ServerMessage } from "@draftspace/collaboration-protocol";
import { randomToken, tokenHash, tokenMatchesHash } from "./security";

type StoredParticipant = { participantId: string; tokenHash: string; role: "viewer" | "editor" };
type RoomMetadata = { roomId: string; hostTokenHash: string; roomRevision: number; hostDisconnectedAt: number | null; unclaimedExpiresAt: number | null; participants: StoredParticipant[] };
type Attachment = { connectionId: string; participantId: string; authenticated: boolean; role: ParticipantRole | "pending"; profile?: ParticipantProfile; messageWindowStartedAt?: number; messageCount?: number; lastPresenceAt?: number; superseded?: boolean };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
export const numberEnv = (value: string | undefined, fallback: number) => {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export class Room extends DurableObject<Env> {
  private metadata: RoomMetadata | null = null;
  /** Guards against close and error both firing cleanup for the same socket. */
  private handledDisconnects = new WeakSet<WebSocket>();

  private async getMetadata() {
    if (!this.metadata) this.metadata = await this.ctx.storage.get<RoomMetadata>("metadata") ?? null;
    return this.metadata;
  }

  private async save(metadata: RoomMetadata) {
    this.metadata = metadata;
    await this.ctx.storage.put("metadata", metadata);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      if (await this.getMetadata()) return json({ error: "room-exists" }, 409);
      const body = await request.json<{ roomId: string; hostTokenHash: string }>();
      const unclaimedExpiresAt = Date.now() + numberEnv(this.env.ROOM_UNCLAIMED_TTL_MS, 300000);
      await this.save({ roomId: body.roomId, hostTokenHash: body.hostTokenHash, roomRevision: 0, hostDisconnectedAt: null, unclaimedExpiresAt, participants: [] });
      await this.ctx.storage.setAlarm(unclaimedExpiresAt);
      return json({ ok: true }, 201);
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket" || !(await this.getMetadata())) return new Response("Not found", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connectionId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectionId, participantId: connectionId, authenticated: false, role: "pending" } satisfies Attachment);
    this.send(server, { type: "connection.ready" });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > numberEnv(this.env.ROOM_MAX_MESSAGE_BYTES, 5_242_880)) return this.error(socket, "invalid-message", "The room message was invalid.");
    let attachment = socket.deserializeAttachment() as Attachment;
    const receivedAt = Date.now();
    const windowStartedAt = attachment.messageWindowStartedAt ?? receivedAt;
    const messageCount = receivedAt - windowStartedAt >= 1000 ? 1 : (attachment.messageCount ?? 0) + 1;
    attachment = { ...attachment, messageWindowStartedAt: receivedAt - windowStartedAt >= 1000 ? receivedAt : windowStartedAt, messageCount };
    socket.serializeAttachment(attachment);
    if (messageCount > 120) return this.error(socket, "rate-limited", "Too many room messages were sent at once.");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return this.error(socket, "invalid-json", "The room message was invalid."); }
    const message = parseClientMessage(parsed);
    if (!message) return this.error(socket, "invalid-message", "The room message was invalid.");
    const metadata = await this.getMetadata();
    if (!metadata) return this.send(socket, { type: "room.ended", reason: "host-timeout" });

    if (message.type === "hello") {
      if (attachment.authenticated) return;
      if (message.mode === "host") {
        if (!message.token || !await tokenMatchesHash(message.token, metadata.hostTokenHash)) return this.error(socket, "unauthorized", "The host token is invalid.");
        this.connections().filter(({ socket: otherSocket, attachment: item }) => otherSocket !== socket && item.authenticated && item.role === "host").forEach(({ socket: otherSocket, attachment: item }) => {
          otherSocket.serializeAttachment({ ...item, superseded: true });
          otherSocket.close(4001, "Reconnected elsewhere");
        });
        // Server-generated id keeps host identity unique; the client profile is display data only.
        const next = { ...attachment, participantId: attachment.connectionId, authenticated: true, role: "host" as const, profile: message.profile };
        socket.serializeAttachment(next);
        const returning = metadata.hostDisconnectedAt !== null;
        metadata.hostDisconnectedAt = null;
        metadata.unclaimedExpiresAt = null;
        await this.ctx.storage.deleteAlarm(); await this.save(metadata);
        this.send(socket, { type: "hello.ack", participantId: next.participantId, role: "host", roomRevision: metadata.roomRevision });
        this.connections().filter(({ socket: otherSocket, attachment: item }) => otherSocket !== socket && item.authenticated && item.role !== "host" && item.profile).forEach(({ attachment: item }) => {
          this.send(socket, { type: "participant.joined", participant: { ...item.profile!, participantId: item.participantId, role: item.role as ParticipantRole } });
        });
        this.connections().filter(({ socket: otherSocket, attachment: item }) => otherSocket !== socket && !item.authenticated && item.role === "pending" && item.profile).forEach(({ attachment: item }) => {
          this.send(socket, { type: "join.request", participant: { ...item.profile!, participantId: item.participantId, role: "viewer" } });
        });
        if (returning) this.broadcast({ type: "host.returned" }, socket);
        return;
      }
      const reconnectHash = message.token ? await tokenHash(message.token) : null;
      const reconnect = reconnectHash ? metadata.participants.find((participant) => participant.tokenHash === reconnectHash) : undefined;
      const activeGuests = this.connections().filter(({ attachment: item }) => item.role !== "host" && (item.authenticated || item.profile)).length;
      if (!reconnect && activeGuests >= numberEnv(this.env.ROOM_MAX_PARTICIPANTS, 4) - 1) return this.error(socket, "room-full", "This room is full.");
      const participantId = reconnect?.participantId ?? attachment.connectionId;
      const role: Attachment["role"] = reconnect?.role ?? "pending";
      socket.serializeAttachment({ ...attachment, participantId, authenticated: Boolean(reconnect), role, profile: message.profile });
      this.send(socket, { type: "hello.ack", participantId, role, roomRevision: metadata.roomRevision });
      if (reconnect) {
        this.connections().filter(({ socket: otherSocket, attachment: item }) => otherSocket !== socket && item.participantId === participantId).forEach(({ socket: otherSocket, attachment: item }) => {
          otherSocket.serializeAttachment({ ...item, superseded: true });
          otherSocket.close(4001, "Reconnected elsewhere");
        });
        this.broadcast({ type: "participant.joined", participant: { ...message.profile, participantId, role: reconnect.role } }, socket);
        this.sendToRole("host", { type: "participant.joined", participant: { ...message.profile, participantId, role: reconnect.role } });
      } else this.sendToRole("host", { type: "join.request", participant: { ...message.profile, participantId, role: "viewer" } });
      return;
    }

    if (!attachment.authenticated && attachment.role !== "pending") return this.error(socket, "unauthorized", "Join the room before sending messages.");
    if (message.type.startsWith("host.") && attachment.role !== "host") return this.error(socket, "forbidden", "Only the host can do that.");
    if (message.type === "host.admit") return this.admit(message.participantId, message.role, metadata);
    if (message.type === "host.reject") return this.reject(message.participantId);
    if (message.type === "host.role") return this.changeRole(message.participantId, message.role, metadata);
    if (message.type === "host.kick") return this.kick(message.participantId, metadata);
    if (message.type === "host.end") return this.endRoom("host-ended");
    if (!attachment.authenticated) return this.error(socket, "pending", "Wait for the host to admit you.");
    if (message.type === "room.leave" && attachment.role !== "host") return this.leaveParticipant(socket, attachment.participantId, metadata);
    if (message.type === "presence.update") {
      if (receivedAt - (attachment.lastPresenceAt ?? 0) < 33) return;
      socket.serializeAttachment({ ...attachment, lastPresenceAt: receivedAt });
      return this.broadcast({ type: "presence.update", participantId: attachment.participantId, presence: message.presence }, socket);
    }
    if (message.type === "command.propose") {
      if (attachment.role !== "editor") return this.error(socket, "viewer", "Viewers cannot edit this room.");
      if (message.proposal.actorId !== attachment.participantId) return this.error(socket, "invalid-actor", "The edit actor was invalid.");
      return this.sendToRole("host", { type: "command.propose", participantId: attachment.participantId, proposal: message.proposal });
    }
    if (message.type === "command.accept") {
      if (attachment.role !== "host") return this.error(socket, "forbidden", "Only the host can accept edits.");
      if (message.proposal.baseRevision !== metadata.roomRevision) return this.error(socket, "stale-revision", "The edit was based on an outdated room revision.");
      metadata.roomRevision += 1; await this.save(metadata);
      return this.broadcast({ type: "command.accept", participantId: message.participantId, proposal: message.proposal, roomRevision: metadata.roomRevision, appliedAt: new Date().toISOString() });
    }
    if (message.type === "command.reject") {
      if (attachment.role !== "host") return this.error(socket, "forbidden", "Only the host can reject edits.");
      return this.sendToParticipant(message.participantId, { type: "command.reject", commandId: message.commandId, reason: message.reason });
    }
    if (message.type === "snapshot.request") return this.sendToRole("host", { type: "snapshot.request", participantId: attachment.participantId });
    if (message.type === "snapshot.response") {
      if (attachment.role !== "host") return this.error(socket, "forbidden", "Only the host can send snapshots.");
      return this.sendToParticipant(message.participantId, { type: "snapshot.response", board: message.board, roomRevision: metadata.roomRevision });
    }
    if (message.type === "ping") this.send(socket, { type: "pong" });
  }

  async webSocketClose(socket: WebSocket) {
    await this.handleDisconnect(socket);
  }

  async webSocketError(socket: WebSocket) {
    await this.handleDisconnect(socket);
  }

  private async handleDisconnect(socket: WebSocket) {
    if (this.handledDisconnects.has(socket)) return;
    this.handledDisconnects.add(socket);
    const attachment = socket.deserializeAttachment() as Attachment;
    if (attachment.superseded) return;
    if (attachment.role === "host") {
      const metadata = await this.getMetadata();
      if (metadata) {
        const deadline = Date.now() + numberEnv(this.env.ROOM_GRACE_PERIOD_MS, 60000);
        metadata.hostDisconnectedAt = Date.now(); await this.save(metadata); await this.ctx.storage.setAlarm(deadline);
        this.broadcast({ type: "host.away", deadline }, socket);
      }
    } else if (attachment.authenticated) this.broadcast({ type: "participant.left", participantId: attachment.participantId }, socket);
    else if (attachment.role === "pending" && attachment.profile) this.sendToRole("host", { type: "participant.left", participantId: attachment.participantId });
  }

  async alarm() {
    const metadata = await this.getMetadata();
    if (metadata?.hostDisconnectedAt || (metadata?.unclaimedExpiresAt && metadata.unclaimedExpiresAt <= Date.now())) await this.endRoom("host-timeout");
  }

  private connections() {
    return this.ctx.getWebSockets().map((socket) => ({ socket, attachment: socket.deserializeAttachment() as Attachment }));
  }
  private send(socket: WebSocket, message: ServerMessage) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
  private error(socket: WebSocket, code: string, message: string) { this.send(socket, { type: "error", code, message }); }
  private broadcast(message: ServerMessage, except?: WebSocket) { this.connections().forEach(({ socket }) => { if (socket !== except) this.send(socket, message); }); }
  private sendToRole(role: ParticipantRole, message: ServerMessage) { this.connections().filter(({ attachment }) => attachment.role === role).forEach(({ socket }) => this.send(socket, message)); }
  private sendToParticipant(participantId: string, message: ServerMessage) { this.connections().filter(({ attachment }) => attachment.participantId === participantId).forEach(({ socket }) => this.send(socket, message)); }

  private async admit(participantId: string, role: "viewer" | "editor", metadata: RoomMetadata) {
    const connection = this.connections().find(({ attachment }) => attachment.participantId === participantId && attachment.role === "pending");
    if (!connection?.attachment.profile) return;
    const reconnectToken = randomToken();
    metadata.participants = metadata.participants.filter((participant) => participant.participantId !== participantId);
    metadata.participants.push({ participantId, role, tokenHash: await tokenHash(reconnectToken) }); await this.save(metadata);
    connection.socket.serializeAttachment({ ...connection.attachment, authenticated: true, role });
    this.send(connection.socket, { type: "room.admitted", role, reconnectToken });
    this.connections().filter(({ attachment }) => attachment.authenticated && attachment.profile && attachment.participantId !== participantId).forEach(({ attachment }) => {
      this.send(connection.socket, { type: "participant.joined", participant: { ...attachment.profile!, participantId: attachment.participantId, role: attachment.role as ParticipantRole } });
    });
    this.broadcast({ type: "participant.joined", participant: { ...connection.attachment.profile, participantId, role } }, connection.socket);
  }
  private reject(participantId: string) { const item = this.connections().find(({ attachment }) => attachment.participantId === participantId); if (item) { item.socket.serializeAttachment({ ...item.attachment, superseded: true }); this.send(item.socket, { type: "room.rejected" }); item.socket.close(4003, "Rejected"); } }
  private async changeRole(participantId: string, role: "viewer" | "editor", metadata: RoomMetadata) {
    const item = this.connections().find(({ attachment }) => attachment.participantId === participantId); if (!item) return;
    item.socket.serializeAttachment({ ...item.attachment, role });
    metadata.participants = metadata.participants.map((participant) => participant.participantId === participantId ? { ...participant, role } : participant); await this.save(metadata);
    this.broadcast({ type: "participant.role", participantId, role });
  }
  private async kick(participantId: string, metadata: RoomMetadata) {
    metadata.participants = metadata.participants.filter((participant) => participant.participantId !== participantId); await this.save(metadata);
    const item = this.connections().find(({ attachment }) => attachment.participantId === participantId);
    if (item) { item.socket.serializeAttachment({ ...item.attachment, superseded: true }); this.send(item.socket, { type: "participant.kicked" }); item.socket.close(4003, "Removed"); this.broadcast({ type: "participant.left", participantId }, item.socket); }
  }
  private async leaveParticipant(socket: WebSocket, participantId: string, metadata: RoomMetadata) {
    metadata.participants = metadata.participants.filter((participant) => participant.participantId !== participantId); await this.save(metadata);
    const attachment = socket.deserializeAttachment() as Attachment; socket.serializeAttachment({ ...attachment, superseded: true });
    this.broadcast({ type: "participant.left", participantId }, socket); socket.close(1000, "Left room");
  }
  private async endRoom(reason: "host-ended" | "host-timeout") { this.broadcast({ type: "room.ended", reason }); this.ctx.getWebSockets().forEach((socket) => socket.close(4000, "Room ended")); await this.ctx.storage.deleteAll(); this.metadata = null; }
}
