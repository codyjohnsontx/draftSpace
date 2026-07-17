import type { BoardDocument } from "@/core/board/types";
import type { BoardRepository } from "@/repositories/board-repository";
import { normalizePersistenceError, type PersistenceError } from "./persistence-errors";

export type AutosaveEvent =
  | { type: "saving"; revision: number }
  | { type: "saved"; revision: number; savedAt: string }
  | { type: "failed"; error: PersistenceError };

export type FlushReason = "debounce" | "visibility" | "pagehide" | "manual";

export type AutosaveCoordinatorOptions = {
  repository: BoardRepository;
  getBoard: () => BoardDocument | null;
  getRevision: () => number;
  debounceMs?: number;
  retryDelaysMs?: number[];
  onStateChange: (event: AutosaveEvent) => void;
};

export class AutosaveCoordinator {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRevision: number | null = null;
  private retryIndex = 0;
  private activeSave: Promise<void> | null = null;
  private disposed = false;
  private readonly debounceMs: number;
  private readonly retryDelays: number[];

  constructor(private readonly options: AutosaveCoordinatorOptions) {
    this.debounceMs = options.debounceMs ?? 500;
    this.retryDelays = options.retryDelaysMs ?? [1000, 2000, 4000];
  }

  schedule(revision: number) {
    if (this.disposed) return;
    this.pendingRevision = Math.max(this.pendingRevision ?? revision, revision);
    if (this.activeSave) return;
    this.clearTimer("debounce");
    this.debounceTimer = setTimeout(() => { void this.flush("debounce"); }, this.debounceMs);
  }

  async flush(reason: FlushReason): Promise<void> {
    void reason;
    if (this.disposed) return;
    this.clearTimer("debounce");
    this.clearTimer("retry");
    if (this.activeSave) return this.activeSave;
    const board = this.options.getBoard(); if (!board) return;
    const revision = this.options.getRevision();
    this.pendingRevision = null;
    const snapshot = structuredClone(board);
    this.options.onStateChange({ type: "saving", revision });
    this.activeSave = this.options.repository.update(snapshot).then(() => {
      this.retryIndex = 0;
      if (this.options.getRevision() === revision) this.options.onStateChange({ type: "saved", revision, savedAt: new Date().toISOString() });
    }).catch((cause) => {
      const error = normalizePersistenceError(cause, "write");
      if (this.retryIndex < this.retryDelays.length) {
        const delay = this.retryDelays[this.retryIndex++];
        this.retryTimer = setTimeout(() => { this.activeSave = null; void this.flush("manual"); }, delay);
      } else this.options.onStateChange({ type: "failed", error });
    }).finally(() => {
      if (!this.retryTimer) this.activeSave = null;
      const latest = this.options.getRevision();
      if (!this.retryTimer && latest > revision) this.schedule(latest);
    });
    return this.activeSave;
  }

  async retry() {
    this.retryIndex = 0; this.clearTimer("retry"); this.activeSave = null;
    await this.flush("manual");
  }

  dispose() { this.disposed = true; this.clearTimer("debounce"); this.clearTimer("retry"); }

  private clearTimer(kind: "debounce" | "retry") {
    const timer = kind === "debounce" ? this.debounceTimer : this.retryTimer;
    if (timer) clearTimeout(timer);
    if (kind === "debounce") this.debounceTimer = null; else this.retryTimer = null;
  }
}
