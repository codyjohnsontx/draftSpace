import { create } from "zustand";
import type { ParticipantProfile, ParticipantRole, ParticipantSummary, PresencePayload } from "@draftspace/collaboration-protocol";

export type CollaborationStatus = "idle" | "creating" | "connecting" | "lobby" | "connected" | "host-away" | "ended" | "error";
export type CollaborationMode = "local" | "host" | "guest";
export type RemoteParticipant = ParticipantSummary & { presence?: PresencePayload };

/**
 * A live room is running in this tab: it is hosting one and the room has not finished. Every
 * reader of this has to agree with every other, because the top bar refuses to switch boards
 * out from under a room precisely when the controller still considers that room worth tearing
 * down. Two spellings of it would drift the first time a status is added.
 */
export function isHostingLiveRoom(state: { mode: CollaborationMode; status: CollaborationStatus }): boolean {
  return state.mode === "host" && !["ended", "error"].includes(state.status);
}

type CollaborationStore = {
  mode: CollaborationMode;
  status: CollaborationStatus;
  code: string | null;
  self: ParticipantProfile | null;
  selfParticipantId: string | null;
  role: ParticipantRole | null;
  roomRevision: number;
  boardReady: boolean;
  participants: Record<string, RemoteParticipant>;
  pending: Record<string, ParticipantSummary>;
  error: string | null;
  /**
   * A live room this tab hosted ended because the tab stopped being the one editing the board.
   * The room it describes is already gone by the time anything reads this, which is the point:
   * `reset()` clears it, so it is recorded after the teardown rather than before, and the host
   * is still told why the room they opened is no longer there.
   */
  hostingEndedByClaimLoss: boolean;
  hostAwayDeadline: number | null;
  presenting: boolean;
  followingHost: boolean;
  set: (patch: Partial<Omit<CollaborationStore, "set" | "reset">>) => void;
  reset: () => void;
};

const initial = {
  mode: "local" as const, status: "idle" as const, code: null, self: null, selfParticipantId: null, role: null,
  roomRevision: 0, boardReady: false, participants: {}, pending: {}, error: null, hostingEndedByClaimLoss: false, hostAwayDeadline: null, presenting: false, followingHost: false,
};

export const useCollaborationStore = create<CollaborationStore>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial, participants: {}, pending: {} }),
}));
