import type { BoardDocument } from "@/core/board/types";
import type { BoardRepository } from "@/repositories/board-repository";
import { normalizePersistenceError, type PersistenceError } from "./persistence-errors";
import { cloneBoardData } from "@/lib/browser/clone-board-data";
import { performanceNow, recordPerformanceSample } from "@/features/performance/performance-monitor";

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
  private savedRevision = 0;
  private writeFailed = false;
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
    if (this.disposed) return;
    this.clearTimer("debounce");
    if (this.retryTimer) return;
    if (this.activeSave) {
      await this.activeSave;
      if (this.disposed || this.retryTimer) return;
      if (this.pendingRevision !== null) await this.flush(reason);
      return;
    }
    const board = this.options.getBoard(); if (!board) return;
    const revision = this.options.getRevision();
    this.pendingRevision = null;
    const snapshot = cloneBoardData(board);
    this.options.onStateChange({ type: "saving", revision });
    const saveStartedAt = performanceNow();
    this.activeSave = this.options.repository.update(snapshot).then(() => {
      recordPerformanceSample({ name: "indexeddb-save", durationMs: performanceNow() - saveStartedAt, elementCount: snapshot.elementIds.length });
      this.retryIndex = 0;
      this.writeFailed = false;
      this.savedRevision = Math.max(this.savedRevision, revision);
      if (this.options.getRevision() === revision) this.options.onStateChange({ type: "saved", revision, savedAt: new Date().toISOString() });
    }).catch((cause) => {
      const error = normalizePersistenceError(cause, "write");
      this.writeFailed = true;
      if (this.retryIndex < this.retryDelays.length) {
        const delay = this.retryDelays[this.retryIndex++];
        this.retryTimer = setTimeout(() => { this.retryTimer = null; this.activeSave = null; void this.flush("manual"); }, delay);
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

  /** Board state this coordinator holds that storage has not accepted, whether waiting or failed. */
  private hasUnsavedWork(): boolean {
    return this.pendingRevision !== null || this.retryTimer !== null || this.activeSave !== null || this.options.getRevision() > this.savedRevision;
  }

  /**
   * Writes everything this coordinator still holds and reports whether storage took it. A caller
   * about to let go of the board asks this rather than `flush`: a retry waiting out its backoff is
   * attempted now instead of skipped, and a write storage will not accept is answered with `false`
   * rather than dropped on the next `drain`.
   */
  async settle(): Promise<boolean> {
    if (this.disposed || !this.options.getBoard()) return true;
    if (!this.retryTimer && this.activeSave) await this.activeSave;
    for (let attempt = 0; attempt < 3 && this.hasUnsavedWork(); attempt += 1) {
      await this.retry();
      if (this.writeFailed) return false;
    }
    return !this.hasUnsavedWork();
  }

  async drain() {
    this.dispose();
    if (this.activeSave) await this.activeSave;
    this.clearTimer("retry");
    this.activeSave = null;
  }

  dispose() { this.disposed = true; this.clearTimer("debounce"); this.clearTimer("retry"); }

  private clearTimer(kind: "debounce" | "retry") {
    const timer = kind === "debounce" ? this.debounceTimer : this.retryTimer;
    if (timer) clearTimeout(timer);
    if (kind === "debounce") this.debounceTimer = null; else this.retryTimer = null;
  }
}
