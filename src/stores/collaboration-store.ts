import { create } from "zustand";
import type { ParticipantProfile, ParticipantRole, ParticipantSummary, PresencePayload } from "@draftspace/collaboration-protocol";

export type CollaborationStatus = "idle" | "creating" | "connecting" | "lobby" | "connected" | "host-away" | "ended" | "error";
export type RemoteParticipant = ParticipantSummary & { presence?: PresencePayload };

type CollaborationStore = {
  mode: "local" | "host" | "guest";
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
  hostAwayDeadline: number | null;
  presenting: boolean;
  followingHost: boolean;
  set: (patch: Partial<Omit<CollaborationStore, "set" | "reset">>) => void;
  reset: () => void;
};

const initial = {
  mode: "local" as const, status: "idle" as const, code: null, self: null, selfParticipantId: null, role: null,
  roomRevision: 0, boardReady: false, participants: {}, pending: {}, error: null, hostAwayDeadline: null, presenting: false, followingHost: false,
};

export const useCollaborationStore = create<CollaborationStore>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set({ ...initial, participants: {}, pending: {} }),
}));
