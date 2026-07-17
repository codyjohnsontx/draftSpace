import { create } from "zustand";
import type { PersistenceError } from "@/features/persistence/persistence-errors";

export type PersistenceStatus = "loading" | "saving" | "saved" | "failed" | "session-only" | "recovery-required";

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
  error: PersistenceError | null;
  recovery: RecoveryPayload | null;
  lastSavedAt: string | null;
  savedRevision: number;
  attemptedRevision: number | null;
  networkOnline: boolean;
  markLoading: () => void;
  markSaving: (revision: number) => void;
  markSaved: (revision: number, savedAt: string) => void;
  markFailed: (error: PersistenceError) => void;
  setError: (error: PersistenceError) => void;
  enterSessionOnly: (error: PersistenceError) => void;
  requireRecovery: (payload: RecoveryPayload) => void;
  clearRecovery: () => void;
  setNetworkOnline: (online: boolean) => void;
};

export const usePersistenceStore = create<PersistenceStore>((set) => ({
  status: "loading", error: null, recovery: null, lastSavedAt: null, savedRevision: 0, attemptedRevision: null,
  networkOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  markLoading: () => set({ status: "loading", error: null, recovery: null }),
  markSaving: (attemptedRevision) => set({ status: "saving", attemptedRevision, error: null }),
  markSaved: (savedRevision, lastSavedAt) => set({ status: "saved", savedRevision, lastSavedAt, attemptedRevision: null, error: null }),
  markFailed: (error) => set({ status: "failed", error, attemptedRevision: null }),
  setError: (error) => set({ error }),
  enterSessionOnly: (error) => set({ status: "session-only", error, attemptedRevision: null }),
  requireRecovery: (recovery) => set({ status: "recovery-required", recovery, error: null, attemptedRevision: null }),
  clearRecovery: () => set({ recovery: null, error: null }),
  setNetworkOnline: (networkOnline) => set({ networkOnline }),
}));
