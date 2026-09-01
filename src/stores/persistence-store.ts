import { create } from "zustand";
import type { BoardSummary } from "@/core/board/types";
import type { PersistenceError } from "@/features/persistence/persistence-errors";

export type PersistenceStatus = "loading" | "saving" | "saved" | "failed" | "session-only" | "recovery-required";

/**
 * Whether this tab holds the board's lease. Only the owner edits and saves; every other
 * tab on the same board views it. Kept apart from `status` because a tab's right to edit
 * and its save state are independent facts.
 */
export type BoardAccess = "owner" | "read-only";

export type RecoveryPayload = {
  boardId: string;
  raw: unknown;
  detectedAt: string;
  reason: "invalid" | "unsupported-version";
  issues: string[];
  schemaVersion?: number;
};

type PersistenceStore = {
  status: PersistenceStatus;
  boardAccess: BoardAccess;
  error: PersistenceError | null;
  /**
   * Something the user has to be told that is not a failure, so `status` has nothing to say
   * about it and the saves that clear `error` must leave it alone. Only opening another board
   * retires it: until then the tab is still showing the board the notice is about.
   */
  notice: PersistenceError | null;
  recovery: RecoveryPayload | null;
  /**
   * Every readable board in this browser, newest first. Persistence state rather than board
   * state: it describes what local storage holds, not the document that is open.
   */
  boards: BoardSummary[];
  lastSavedAt: string | null;
  savedRevision: number;
  attemptedRevision: number | null;
  networkOnline: boolean;
  setBoardAccess: (boardAccess: BoardAccess) => void;
  markLoading: () => void;
  markSaving: (revision: number) => void;
  markSaved: (revision: number, savedAt: string) => void;
  markFailed: (error: PersistenceError) => void;
  setError: (error: PersistenceError) => void;
  setNotice: (notice: PersistenceError) => void;
  enterSessionOnly: (error: PersistenceError) => void;
  requireRecovery: (payload: RecoveryPayload) => void;
  clearRecovery: () => void;
  setNetworkOnline: (online: boolean) => void;
  setBoards: (boards: BoardSummary[]) => void;
};

export const usePersistenceStore = create<PersistenceStore>((set) => ({
  status: "loading", boardAccess: "owner", error: null, notice: null, recovery: null, boards: [], lastSavedAt: null, savedRevision: 0, attemptedRevision: null,
  networkOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  setBoardAccess: (boardAccess) => set({ boardAccess }),
  markLoading: () => set({ status: "loading", error: null, notice: null, recovery: null }),
  markSaving: (attemptedRevision) => set({ status: "saving", attemptedRevision, error: null }),
  markSaved: (savedRevision, lastSavedAt) => set({ status: "saved", savedRevision, lastSavedAt, attemptedRevision: null, error: null }),
  markFailed: (error) => set({ status: "failed", error, attemptedRevision: null }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  enterSessionOnly: (error) => set({ status: "session-only", error, attemptedRevision: null }),
  requireRecovery: (recovery) => set({ status: "recovery-required", recovery, error: null, attemptedRevision: null }),
  clearRecovery: () => set({ recovery: null, error: null }),
  setNetworkOnline: (networkOnline) => set({ networkOnline }),
  setBoards: (boards) => set({ boards }),
}));
