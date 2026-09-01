/**
 * One tab's exclusive claim on one board.
 *
 * Every tab keeps its own copy of the document and autosaves the whole thing, so two tabs
 * on the same board overwrite each other. The lease makes that impossible: only the tab
 * holding it saves, and every other tab opens read-only.
 *
 * It is backed by the Web Locks API because the browser releases a lock when the holding
 * tab closes, crashes, or the browser is force-quit. Nothing is written down, so no stale
 * claim can ever lock someone out of their own board.
 */

const lockName = (boardId: string) => `draftspace:board:${boardId}`;

const lockManager = (): LockManager | null =>
  typeof navigator !== "undefined" && typeof navigator.locks?.request === "function" ? navigator.locks : null;

export type BoardLeaseOptions = {
  boardId: string;
  /**
   * Runs once a read-only lease is promoted, after the owning tab let the board go. It is
   * handed the lease being promoted so work that resumes after an await can prove it is
   * still acting for the claim it started with.
   */
  onPromoted?: (lease: BoardLease) => void | Promise<void>;
};

export class BoardLease {
  private releaseHeld: (() => void) | null = null;
  private waiter: AbortController | null = null;
  private released = false;

  private constructor(
    readonly boardId: string,
    private owner: boolean,
    private readonly onPromoted?: (lease: BoardLease) => void | Promise<void>,
  ) {}

  /** True while this tab is the one allowed to edit and save the board. */
  get isOwner() { return this.owner; }

  /**
   * Settles as soon as the claim is decided, never waiting on another tab, so opening a
   * board alone costs one lock check rather than a delay or a prompt.
   *
   * Without the Web Locks API the tab claims the board outright: an unenforceable lease
   * would leave the user read-only with no way back, which is worse than today's behaviour.
   */
  static async acquire({ boardId, onPromoted }: BoardLeaseOptions): Promise<BoardLease> {
    const locks = lockManager();
    if (!locks) return new BoardLease(boardId, true, onPromoted);
    const lease = new BoardLease(boardId, false, onPromoted);
    if (await lease.claim(locks)) lease.owner = true;
    else lease.waitForRelease(locks);
    return lease;
  }

  release() {
    this.released = true;
    this.owner = false;
    this.waiter?.abort();
    this.waiter = null;
    this.releaseHeld?.();
    this.releaseHeld = null;
  }

  /** Takes the lock only if it is free right now, so a lone tab is never made to wait. */
  private claim(locks: LockManager) {
    return new Promise<boolean>((settle) => {
      void locks.request(lockName(this.boardId), { mode: "exclusive", ifAvailable: true }, (lock) => {
        if (!lock || this.released) { settle(false); return; }
        settle(true);
        return new Promise<void>((release) => { this.releaseHeld = release; });
      }).catch(() => settle(false));
    });
  }

  /** Queues behind the owning tab. The browser grants this the instant that tab lets go, including when it dies. */
  private waitForRelease(locks: LockManager) {
    const waiter = new AbortController();
    this.waiter = waiter;
    void locks.request(lockName(this.boardId), { mode: "exclusive", signal: waiter.signal }, (lock) => {
      if (!lock || this.released) return;
      this.waiter = null;
      this.owner = true;
      const held = new Promise<void>((release) => { this.releaseHeld = release; });
      void Promise.resolve(this.onPromoted?.(this)).catch((error) => console.error("Draftspace could not take over this board", error));
      return held;
    }).catch(() => { /* Aborted by release(), or the lock manager refused the wait. Either way this tab stays read-only. */ });
  }
}

/**
 * The tab holds at most one lease. Keeping it here rather than in a component means a
 * remount can always release what the previous mount claimed, so a tab can never end up
 * blocked by its own stale claim.
 */
let current: BoardLease | null = null;

export async function claimBoard(options: BoardLeaseOptions): Promise<BoardLease> {
  releaseBoardClaim();
  const lease = await BoardLease.acquire(options);
  current = lease;
  return lease;
}

/**
 * Whether this exact lease is still the one the tab holds. A board id cannot answer that:
 * switching away and back reuses it, so a callback resuming after an await would pass a
 * board-id check while acting for a claim that was released and replaced in between.
 */
export const boardClaimIsCurrent = (lease: BoardLease) => current === lease && lease.isOwner;

export function releaseBoardClaim() {
  current?.release();
  current = null;
}
