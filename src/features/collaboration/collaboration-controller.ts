"use client";

import type { ClientMessage, CommandProposal, ParticipantProfile, PresencePayload, ServerMessage } from "@draftspace/collaboration-protocol";
import { PROTOCOL_VERSION } from "@draftspace/collaboration-protocol";
import { boardSchema } from "@/schemas/board-schema";
import { parseBoardCommand, setLocalActorIdProvider, setLocalCommandAuthorizationProvider, type BoardCommandMetadata } from "@/core/commands/board-command";
import { subscribeToBoardCommands, useBoardStore, type BoardCommandEvent } from "@/stores/board-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useViewportStore } from "@/stores/viewport-store";
import { useSessionStore } from "@/stores/session-store";
import { WebSocketCollaborationTransport, type CollaborationTransport } from "./collaboration-transport";

const httpUrl = () => process.env.NEXT_PUBLIC_COLLABORATION_HTTP_URL ?? "http://127.0.0.1:8787";
const wsUrl = () => process.env.NEXT_PUBLIC_COLLABORATION_WS_URL ?? "ws://127.0.0.1:8787";
const hostSessionKey = "draftspace:collaboration-host";
const guestSessionKey = "draftspace:collaboration-guest";
const roomCreationTimeoutMs = 10_000;

type ConnectionDetails = { mode: "host" | "guest"; code: string; url: string; token?: string; profile: ParticipantProfile };

export class CollaborationController {
  private transport: CollaborationTransport;
  private connection: ConnectionDetails | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private deliberateClose = false;
  private appliedCommandIds = new Set<string>();
  private proposalQueue: CommandProposal[] = [];
  private proposalInFlight: string | null = null;
  private unsubscribeCommands: () => void;

  constructor(transport: CollaborationTransport = new WebSocketCollaborationTransport()) {
    this.transport = transport;
    this.unsubscribeCommands = subscribeToBoardCommands((event) => this.onBoardCommand(event));
    setLocalCommandAuthorizationProvider(() => {
      const state = useCollaborationStore.getState();
      return state.mode !== "guest" || (state.status === "connected" && state.role === "editor");
    });
  }

  async startHost(profile: ParticipantProfile) {
    this.deliberateClose = false; this.appliedCommandIds.clear(); this.clearProposalQueue();
    useCollaborationStore.getState().set({ mode: "host", status: "creating", self: profile, boardReady: true, error: null });
    setLocalActorIdProvider(() => profile.id);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), roomCreationTimeoutMs);
    try {
      const response = await fetch(`${httpUrl()}/rooms`, { method: "POST", signal: abortController.signal });
      if (!response.ok) throw new Error("Draftspace could not create a live room.");
      const room = await response.json() as { code: string; hostToken: string; websocketUrl?: string };
      const details = { mode: "host" as const, code: room.code, token: room.hostToken, profile, url: room.websocketUrl ?? `${wsUrl()}/rooms/${room.code}/connect` };
      sessionStorage.setItem(hostSessionKey, JSON.stringify(details));
      this.connect(details);
    } catch (error) { useCollaborationStore.getState().set({ status: "error", error: error instanceof Error ? error.message : "Draftspace could not create a live room." }); }
    finally { clearTimeout(timeout); }
  }

  join(code: string, profile: ParticipantProfile) {
    this.deliberateClose = false; this.appliedCommandIds.clear(); this.clearProposalQueue(); setLocalActorIdProvider(() => profile.id);
    const normalized = code.trim().toUpperCase();
    let reconnectToken: string | undefined;
    try { const stored = JSON.parse(sessionStorage.getItem(guestSessionKey) ?? "null"); if (stored?.code === normalized) reconnectToken = stored.token; } catch { /* Join without a reconnect token. */ }
    this.connect({ mode: "guest", code: normalized, token: reconnectToken, profile, url: `${wsUrl()}/rooms/${normalized}/connect` });
  }

  resumeHost(): boolean {
    if (typeof sessionStorage === "undefined" || useCollaborationStore.getState().status !== "idle") return false;
    try {
      const stored = JSON.parse(sessionStorage.getItem(hostSessionKey) ?? "null") as ConnectionDetails | null;
      if (!stored || stored.mode !== "host" || !stored.code || !stored.token || !stored.profile) return false;
      this.deliberateClose = false; this.appliedCommandIds.clear(); this.clearProposalQueue(); setLocalActorIdProvider(() => stored.profile.id); this.connect(stored); return true;
    } catch { return false; }
  }

  resumeGuest(code: string, profile: ParticipantProfile): boolean {
    if (typeof sessionStorage === "undefined" || useCollaborationStore.getState().status !== "idle") return false;
    try {
      const stored = JSON.parse(sessionStorage.getItem(guestSessionKey) ?? "null") as { code?: string; token?: string } | null;
      const normalized = code.trim().toUpperCase();
      if (!stored?.token || stored.code !== normalized) return false;
      this.deliberateClose = false; this.appliedCommandIds.clear(); this.clearProposalQueue(); setLocalActorIdProvider(() => profile.id);
      this.connect({ mode: "guest", code: normalized, token: stored.token, profile, url: `${wsUrl()}/rooms/${normalized}/connect` }); return true;
    } catch { return false; }
  }

  admit(participantId: string, role: "viewer" | "editor") { this.send({ type: "host.admit", participantId, role }); }
  reject(participantId: string) { this.send({ type: "host.reject", participantId }); this.removePending(participantId); }
  setRole(participantId: string, role: "viewer" | "editor") { this.send({ type: "host.role", participantId, role }); }
  kick(participantId: string) { this.send({ type: "host.kick", participantId }); }
  endRoom() { this.send({ type: "host.end" }); this.leave(true); }
  leave(forgetSession = false) {
    this.deliberateClose = true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (forgetSession && useCollaborationStore.getState().mode === "guest") this.send({ type: "room.leave" });
    this.transport.close();
    if (forgetSession && typeof sessionStorage !== "undefined") { sessionStorage.removeItem(hostSessionKey); sessionStorage.removeItem(guestSessionKey); }
    this.connection = null; this.clearProposalQueue(); useCollaborationStore.getState().reset(); setLocalActorIdProvider(() => "local");
  }
  setPresenting(presenting: boolean) { useCollaborationStore.getState().set({ presenting }); this.publishPresence(); }
  setFollowingHost(followingHost: boolean) { useCollaborationStore.getState().set({ followingHost }); }

  publishPresence(presence?: Partial<PresencePayload>) {
    const collaboration = useCollaborationStore.getState();
    if (collaboration.status !== "connected") return;
    const session = sessionStoreSnapshot();
    this.send({ type: "presence.update", presence: {
      cursor: presence?.cursor ?? session.cursor,
      selectedElementIds: (presence?.selectedElementIds ?? session.selectedElementIds).slice(0, 250),
      selectionCount: presence?.selectionCount ?? session.selectedElementIds.length,
      activeTool: presence?.activeTool ?? session.activeTool,
      ...(collaboration.mode === "host" && collaboration.presenting ? { presentingViewport: useViewportStore.getState().viewport } : {}),
    } });
  }

  private connect(details: ConnectionDetails) {
    this.connection = details; this.reconnectAttempt = 0;
    useCollaborationStore.getState().set({ mode: details.mode, status: "connecting", code: details.code, self: details.profile, boardReady: details.mode === "host", error: null });
    this.openTransport();
  }

  private openTransport() {
    const details = this.connection; if (!details) return;
    this.transport.connect(details.url, {
      onOpen: () => { this.reconnectAttempt = 0; this.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, mode: details.mode, token: details.token, profile: details.profile }); },
      onMessage: (message) => { void this.onMessage(message); },
      onClose: () => this.onClose(),
      onError: () => useCollaborationStore.getState().set({ error: "The live connection was interrupted." }),
    });
  }

  private onClose() {
    if (this.deliberateClose || !this.connection || ["ended", "error"].includes(useCollaborationStore.getState().status)) return;
    useCollaborationStore.getState().set({ status: "connecting" });
    const delay = Math.min(5000, 500 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => this.openTransport(), delay);
  }

  private async onMessage(message: ServerMessage) {
    const store = useCollaborationStore.getState();
    if (message.type === "hello.ack") {
      store.set({ selfParticipantId: message.participantId, role: message.role === "pending" ? null : message.role, roomRevision: message.roomRevision, status: message.role === "pending" ? "lobby" : "connected" });
      if (message.role !== "pending" && store.mode === "guest") { this.clearProposalQueue(); this.send({ type: "snapshot.request" }); }
      return;
    }
    if (message.type === "join.request") { store.set({ pending: { ...store.pending, [message.participant.participantId]: message.participant } }); return; }
    if (message.type === "room.admitted") {
      if (this.connection) { this.connection.token = message.reconnectToken; sessionStorage.setItem(guestSessionKey, JSON.stringify({ code: this.connection.code, token: message.reconnectToken })); }
      store.set({ role: message.role, status: "connected" }); this.send({ type: "snapshot.request" }); return;
    }
    if (message.type === "room.rejected" || message.type === "participant.kicked") { sessionStorage.removeItem(guestSessionKey); store.set({ status: "ended", error: message.type === "room.rejected" ? "The host did not admit this request." : "The host removed you from the room." }); return; }
    if (message.type === "participant.joined") { this.removePending(message.participant.participantId); const current = useCollaborationStore.getState(); current.set({ participants: { ...current.participants, [message.participant.participantId]: message.participant } }); return; }
    if (message.type === "participant.left") { const participants = { ...store.participants }; const pending = { ...store.pending }; delete participants[message.participantId]; delete pending[message.participantId]; store.set({ participants, pending }); return; }
    if (message.type === "participant.role") {
      const participant = store.participants[message.participantId];
      const isSelf = message.participantId === store.selfParticipantId;
      store.set({ participants: participant ? { ...store.participants, [message.participantId]: { ...participant, role: message.role } } : store.participants, ...(isSelf ? { role: message.role } : {}) });
      if (isSelf && message.role === "viewer") { this.clearProposalQueue(); useSessionStore.getState().setStylePreview(null); useSessionStore.getState().setTool("select"); this.send({ type: "snapshot.request" }); }
      return;
    }
    if (message.type === "presence.update") {
      const participant = store.participants[message.participantId];
      if (participant) store.set({ participants: { ...store.participants, [message.participantId]: { ...participant, presence: message.presence } } });
      if (store.followingHost && message.presence.presentingViewport) useViewportStore.getState().setViewport(message.presence.presentingViewport);
      return;
    }
    if (message.type === "command.propose" && store.mode === "host") {
      const command = parseBoardCommand(message.proposal.command);
      if (!command) return this.send({ type: "command.reject", participantId: message.participantId, commandId: message.proposal.commandId, reason: "The edit was invalid." });
      const board = useBoardStore.getState().board;
      if (!board || message.proposal.boardId !== board.id) return this.send({ type: "command.reject", participantId: message.participantId, commandId: message.proposal.commandId, reason: "The edit belongs to a different board." });
      if (message.proposal.baseRevision !== store.roomRevision) return this.send({ type: "command.reject", participantId: message.participantId, commandId: message.proposal.commandId, reason: "The board changed before this edit arrived." });
      const metadata = { commandId: message.proposal.commandId, actorId: message.participantId, label: message.proposal.metadata.label, intent: message.proposal.metadata.intent } as BoardCommandMetadata;
      const applied = useBoardStore.getState().dispatchCommand(command, metadata, "remote", metadata.intent !== "undo" && metadata.intent !== "redo");
      if (!applied) return this.send({ type: "command.reject", participantId: message.participantId, commandId: message.proposal.commandId, reason: "The edit no longer applies." });
      this.appliedCommandIds.add(message.proposal.commandId);
      store.set({ roomRevision: store.roomRevision + 1 });
      this.send({ type: "command.accept", participantId: message.participantId, proposal: message.proposal }); return;
    }
    if (message.type === "command.accept") {
      store.set({ roomRevision: message.roomRevision });
      if (!this.appliedCommandIds.has(message.proposal.commandId)) {
        const command = parseBoardCommand(message.proposal.command);
        if (!command) return this.send({ type: "snapshot.request" });
        const metadata = { commandId: message.proposal.commandId, actorId: message.participantId, label: message.proposal.metadata.label, intent: message.proposal.metadata.intent } as BoardCommandMetadata;
        useBoardStore.getState().dispatchCommand(command, metadata, "remote", metadata.intent !== "undo" && metadata.intent !== "redo"); this.appliedCommandIds.add(message.proposal.commandId);
      }
      if (store.mode === "guest" && message.participantId === store.selfParticipantId && this.proposalInFlight === message.proposal.commandId) {
        this.proposalInFlight = null;
        this.sendNextProposal();
      }
      return;
    }
    if (message.type === "command.reject") { store.set({ error: message.reason }); this.clearProposalQueue(); this.send({ type: "snapshot.request" }); return; }
    if (message.type === "snapshot.request" && store.mode === "host") { const board = useBoardStore.getState().board; if (board) this.send({ type: "snapshot.response", participantId: message.participantId, board, roomRevision: store.roomRevision }); return; }
    if (message.type === "snapshot.response" && store.mode === "guest") {
      const result = boardSchema.safeParse(message.board);
      if (!result.success) { store.set({ status: "error", error: "The shared board could not be validated." }); return; }
      useBoardStore.getState().setBoard(result.data); useViewportStore.getState().setViewport(result.data.viewport); store.set({ roomRevision: message.roomRevision, boardReady: true, status: "connected", error: null }); return;
    }
    if (message.type === "host.away") { this.clearProposalQueue(); useSessionStore.getState().setStylePreview(null); useSessionStore.getState().setTool("select"); store.set({ status: "host-away", hostAwayDeadline: message.deadline }); return; }
    if (message.type === "host.returned") { store.set({ status: "connected", hostAwayDeadline: null }); if (store.mode === "guest") this.send({ type: "snapshot.request" }); return; }
    if (message.type === "room.ended") { sessionStorage.removeItem(hostSessionKey); sessionStorage.removeItem(guestSessionKey); store.set({ status: "ended", error: message.reason === "host-timeout" ? "The host did not reconnect, so the room ended." : "The host ended the room." }); return; }
    if (message.type === "error") {
      if (message.code === "unauthorized") { sessionStorage.removeItem(hostSessionKey); sessionStorage.removeItem(guestSessionKey); }
      store.set({ error: message.message, ...(["room-full", "unauthorized"].includes(message.code) ? { status: "error" as const } : {}) });
    }
  }

  private onBoardCommand(event: BoardCommandEvent) {
    if (event.origin !== "local") return;
    const store = useCollaborationStore.getState();
    if (store.status !== "connected" || !store.selfParticipantId || store.role === "viewer") return;
    const proposal: CommandProposal = { protocolVersion: PROTOCOL_VERSION, commandId: event.metadata.commandId, boardId: useBoardStore.getState().board?.id ?? "", actorId: store.selfParticipantId, baseRevision: store.roomRevision, command: event.command, metadata: { label: event.metadata.label, intent: event.metadata.intent } };
    this.appliedCommandIds.add(proposal.commandId);
    if (store.mode === "host") {
      store.set({ roomRevision: store.roomRevision + 1 });
      this.send({ type: "command.accept", participantId: store.selfParticipantId, proposal });
    } else if (store.role === "editor") {
      this.proposalQueue.push(proposal);
      this.sendNextProposal();
    }
  }

  private sendNextProposal() {
    if (this.proposalInFlight || !this.proposalQueue.length) return;
    const proposal = { ...this.proposalQueue.shift()!, baseRevision: useCollaborationStore.getState().roomRevision };
    this.proposalInFlight = proposal.commandId;
    this.send({ type: "command.propose", proposal });
  }

  private clearProposalQueue() { this.proposalQueue = []; this.proposalInFlight = null; }

  private send(message: ClientMessage) { this.transport.send(message); }
  private removePending(participantId: string) { const current = useCollaborationStore.getState(); const pending = { ...current.pending }; delete pending[participantId]; current.set({ pending }); }
  dispose() { this.leave(); this.unsubscribeCommands(); }
}

function sessionStoreSnapshot() {
  const state = useSessionStore.getState();
  return { cursor: state.pointerWorld, selectedElementIds: state.selectedIds, activeTool: state.activeTool };
}

export const collaborationController = new CollaborationController();
