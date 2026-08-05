import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardLease, claimBoard, releaseBoardClaim } from "@/features/persistence/board-lease";

const abortError = () => new DOMException("The request was aborted.", "AbortError");

/**
 * A stand-in for the browser's lock manager with the two behaviours the lease depends on:
 * `ifAvailable` refuses instead of queueing, and a queued waiter is granted the moment the
 * holder lets go, including when the holder is a tab that died without releasing.
 */
function fakeLockManager() {
  const holders = new Map<string, () => void>();
  const waiters = new Map<string, Array<() => void>>();

  const hold = async (name: string, callback: (lock: Lock | null) => unknown) => {
    let letGo!: () => void;
    const untilKilled = new Promise<void>((resolve) => { letGo = resolve; });
    holders.set(name, letGo);
    // A lock is held for as long as the callback's promise stays pending.
    await Promise.race([Promise.resolve(callback({ name, mode: "exclusive" } as Lock)), untilKilled]);
    holders.delete(name);
    waiters.get(name)?.shift()?.();
  };

  return {
    request: async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      if (!holders.has(name)) return hold(name, callback);
      if (options.ifAvailable) return callback(null);
      await new Promise<void>((resolve, reject) => {
        if (options.signal?.aborted) { reject(abortError()); return; }
        waiters.set(name, [...(waiters.get(name) ?? []), resolve]);
        options.signal?.addEventListener("abort", () => reject(abortError()));
      });
      return hold(name, callback);
    },
    /** The holding tab closing, crashing, or being force-quit: no polite release. */
    killHolder: (name: string) => holders.get(name)?.(),
  };
}

const withLocks = (manager: unknown) => {
  Object.defineProperty(navigator, "locks", { value: manager, configurable: true, writable: true });
};

afterEach(() => { releaseBoardClaim(); withLocks(undefined); });

describe("board lease", () => {
  it("gives the board to the only tab that asks for it", async () => {
    withLocks(fakeLockManager());
    expect((await BoardLease.acquire({ boardId: "board-1" })).isOwner).toBe(true);
  });

  it("opens read-only when another tab already holds the board", async () => {
    withLocks(fakeLockManager());
    const first = await BoardLease.acquire({ boardId: "board-1" });
    const second = await BoardLease.acquire({ boardId: "board-1" });
    expect(first.isOwner).toBe(true);
    expect(second.isOwner).toBe(false);
  });

  it("leaves a tab on a different board alone", async () => {
    withLocks(fakeLockManager());
    await BoardLease.acquire({ boardId: "board-1" });
    expect((await BoardLease.acquire({ boardId: "board-2" })).isOwner).toBe(true);
  });

  it("hands the board to the waiting tab when the owner releases it", async () => {
    withLocks(fakeLockManager());
    const promoted = vi.fn();
    const owner = await BoardLease.acquire({ boardId: "board-1" });
    const reader = await BoardLease.acquire({ boardId: "board-1", onPromoted: promoted });
    expect(reader.isOwner).toBe(false);

    owner.release();
    await vi.waitFor(() => expect(promoted).toHaveBeenCalledTimes(1));
    expect(reader.isOwner).toBe(true);
  });

  it("hands the board over when the owning tab dies without releasing", async () => {
    const manager = fakeLockManager();
    withLocks(manager);
    const promoted = vi.fn();
    await BoardLease.acquire({ boardId: "board-1" });
    const reader = await BoardLease.acquire({ boardId: "board-1", onPromoted: promoted });

    manager.killHolder("draftspace:board:board-1");
    await vi.waitFor(() => expect(reader.isOwner).toBe(true));
    expect(promoted).toHaveBeenCalledTimes(1);
  });

  it("stops waiting once the reading tab gives the board up", async () => {
    withLocks(fakeLockManager());
    const promoted = vi.fn();
    const owner = await BoardLease.acquire({ boardId: "board-1" });
    const reader = await BoardLease.acquire({ boardId: "board-1", onPromoted: promoted });

    reader.release();
    owner.release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(promoted).not.toHaveBeenCalled();
    expect(reader.isOwner).toBe(false);
  });

  it("claims the board outright when the browser has no Web Locks", async () => {
    withLocks(undefined);
    expect((await BoardLease.acquire({ boardId: "board-1" })).isOwner).toBe(true);
    expect((await BoardLease.acquire({ boardId: "board-1" })).isOwner).toBe(true);
  });

  it("releases the tab's previous claim before taking a new one", async () => {
    withLocks(fakeLockManager());
    await claimBoard({ boardId: "board-1" });
    await claimBoard({ boardId: "board-2" });
    expect((await BoardLease.acquire({ boardId: "board-1" })).isOwner).toBe(true);
  });
});
