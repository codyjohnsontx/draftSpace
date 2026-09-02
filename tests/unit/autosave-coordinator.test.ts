import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "@/core/board/factory";
import { AutosaveCoordinator, type AutosaveEvent } from "@/features/persistence/autosave-coordinator";
import type { BoardDocument } from "@/core/board/types";
import type { BoardRepository } from "@/repositories/board-repository";

afterEach(() => vi.useRealTimers());

function setup(update = vi.fn(async () => {}), retryDelaysMs = [1000, 2000, 4000]) {
  let revision = 1; const events: AutosaveEvent[] = []; const stored: BoardDocument[] = []; const board = createBoard();
  const repository = { update } as unknown as BoardRepository;
  const coordinator = new AutosaveCoordinator({ repository, getBoard: () => board, getRevision: () => revision, debounceMs: 500, retryDelaysMs, onStateChange: (event) => events.push(event), onStored: (written) => stored.push(written) });
  return { coordinator, update, events, stored, setRevision: (value: number) => { revision = value; } };
}

describe("autosave coordinator", () => {
  it("debounces multiple revisions into one save", async () => {
    vi.useFakeTimers(); const test = setup(); test.coordinator.schedule(1); test.setRevision(2); test.coordinator.schedule(2);
    await vi.advanceTimersByTimeAsync(500); expect(test.update).toHaveBeenCalledTimes(1); expect(test.events.some((event) => event.type === "saved" && event.revision === 2)).toBe(true);
  });
  it("flushes immediately for a lifecycle event", async () => {
    vi.useFakeTimers(); const test = setup(); test.coordinator.schedule(1); await test.coordinator.flush("visibility");
    expect(test.update).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(500); expect(test.update).toHaveBeenCalledTimes(1);
  });
  it("schedules a follow-up save when a newer revision arrives", async () => {
    vi.useFakeTimers(); let resolve!: () => void; const update = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined); const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500); test.setRevision(2); test.coordinator.schedule(2); const flushed = test.coordinator.flush("pagehide"); resolve(); await flushed;
    expect(test.events.some((event) => event.type === "saved" && event.revision === 1)).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it("preserves retry backoff when a lifecycle flush occurs", async () => {
    vi.useFakeTimers(); const update = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValue(undefined); const test = setup(update);
    await test.coordinator.flush("manual"); await test.coordinator.flush("pagehide");
    await vi.advanceTimersByTimeAsync(999); expect(update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(update).toHaveBeenCalledTimes(2);
  });
  it("retries three times before exposing failure", async () => {
    vi.useFakeTimers(); const update = vi.fn(async () => { throw new Error("nope"); }); const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500); await vi.advanceTimersByTimeAsync(1000); await vi.advanceTimersByTimeAsync(2000); await vi.advanceTimersByTimeAsync(4000);
    expect(update).toHaveBeenCalledTimes(4); expect(test.events.at(-1)?.type).toBe("failed");
  });
  it("manual retry resets an exhausted coordinator", async () => {
    vi.useFakeTimers(); const update = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValue(undefined); const test = setup(update, []);
    await test.coordinator.flush("manual"); expect(test.events.at(-1)?.type).toBe("failed"); await test.coordinator.retry(); expect(test.events.at(-1)?.type).toBe("saved");
  });
  it("settles debounced work for a caller about to let the board go", async () => {
    vi.useFakeTimers(); const test = setup(); test.coordinator.schedule(1);
    await expect(test.coordinator.settle()).resolves.toBe(true);
    expect(test.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500); expect(test.update).toHaveBeenCalledTimes(1);
  });
  it("settling attempts a retry that is still waiting out its backoff", async () => {
    vi.useFakeTimers(); const update = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValue(undefined); const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500); expect(update).toHaveBeenCalledTimes(1);
    await expect(test.coordinator.settle()).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
  });
  it("reports work storage would not take rather than reporting success", async () => {
    vi.useFakeTimers(); const update = vi.fn(async () => { throw new Error("nope"); }); const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500);
    await expect(test.coordinator.settle()).resolves.toBe(false);
    // The failure is left on the status rather than a fresh "saving" that hides it.
    expect(test.events.at(-1)).toMatchObject({ type: "failed" });
    // The coordinator keeps the work, and spends the ladder it was on rather than starting over.
    await vi.advanceTimersByTimeAsync(1999); expect(update).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(update).toHaveBeenCalledTimes(3);
  });
  /**
   * A caller keeping its own record of what storage holds cannot read that off the `saved` event:
   * the event is suppressed when the board moves on mid-write, and the record written is stored
   * either way. Leaving autosave out of that record is what let a retry read its own last write
   * as another tab's work.
   */
  it("reports the document storage accepted even when the board moved on mid-write", async () => {
    vi.useFakeTimers(); let resolve!: () => void;
    const update = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined);
    const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500);
    test.setRevision(2); resolve(); await vi.advanceTimersByTimeAsync(0);
    expect(test.events.some((event) => event.type === "saved" && event.revision === 1)).toBe(false);
    expect(test.stored).toHaveLength(1);
  });

  it("says nothing was stored when the write was refused", async () => {
    vi.useFakeTimers(); const update = vi.fn(async () => { throw new Error("nope"); }); const test = setup(update, []);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500);
    expect(test.events.at(-1)?.type).toBe("failed");
    expect(test.stored).toHaveLength(0);
  });

  it("disposal clears scheduled work", async () => {
    vi.useFakeTimers(); const test = setup(); test.coordinator.schedule(1); test.coordinator.dispose(); await vi.advanceTimersByTimeAsync(1000); expect(test.update).not.toHaveBeenCalled();
  });
  it("drains an active save before completing and cancels later work", async () => {
    vi.useFakeTimers(); let resolve!: () => void; const update = vi.fn(() => new Promise<void>((done) => { resolve = done; })); const test = setup(update);
    test.coordinator.schedule(1); await vi.advanceTimersByTimeAsync(500); let drained = false; const drain = test.coordinator.drain().then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false); resolve(); await drain; expect(drained).toBe(true);
    test.setRevision(2); test.coordinator.schedule(2); await vi.advanceTimersByTimeAsync(500); expect(update).toHaveBeenCalledTimes(1);
  });
});
