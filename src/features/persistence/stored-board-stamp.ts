/**
 * The stored record a tab last agreed with.
 *
 * Holding the board's claim makes a write exclusive, not current: the claim says no other tab
 * is writing right now, never that this tab's copy is the newest one. A tab that reloads before
 * it writes closes that gap on its own. A tab that cannot reload, because the draft on screen is
 * unsaved work, needs to know whether the stored record moved on while it was not writing.
 *
 * `updatedAt` is the whole test. Every document mutation stamps it, so a record whose stamp is
 * not the one this tab last read or wrote is a record carrying someone else's work.
 */
export type StoredBoardStamp = { boardId: string; updatedAt: string };

export function storedRecordMovedOn(existing: unknown, boardId: string, stamp: StoredBoardStamp | null): boolean {
  if (existing === null || existing === undefined) return false;
  // No stamp for this board means this tab never saw a stored record for it, so whatever is
  // there was put there by someone else.
  if (!stamp || stamp.boardId !== boardId) return true;
  return (existing as { updatedAt?: unknown }).updatedAt !== stamp.updatedAt;
}
