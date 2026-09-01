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

/**
 * Whether this tab's copy of a board is the record storage holds, which is the other question
 * the same stamp answers: not "has someone else moved the record on" but "is there anything here
 * storage has not got". A tab with no coordinator left to write - one that gave up on storage,
 * or one whose claim broke mid-handover - can only let its board go if the answer is yes.
 *
 * `updatedAt` is the whole test here too, because every document mutation stamps it, so a draft
 * still carrying the stamped one is a draft nothing has changed since the write. That is one
 * currency for one fact rather than two, which is the point; it is not a claim that a timestamp
 * cannot collide. Two mutations inside one clock tick share an `updatedAt`, and reaching it here
 * needs the second to land in the same millisecond as the one that was written, with a storage
 * round-trip in between - a sub-millisecond window judged not worth a second mechanism, not one
 * that cannot exist. Whether `revision` is the better currency is issue #20, and it moves both
 * this and `storedRecordMovedOn` or neither.
 */
export function draftIsStored(board: { id: string; updatedAt: string }, stamp: StoredBoardStamp | null): boolean {
  if (!stamp || stamp.boardId !== board.id) return false;
  return board.updatedAt === stamp.updatedAt;
}

export function storedRecordMovedOn(existing: unknown, boardId: string, stamp: StoredBoardStamp | null): boolean {
  if (existing === null || existing === undefined) return false;
  // No stamp for this board means this tab never saw a stored record for it, so whatever is
  // there was put there by someone else.
  if (!stamp || stamp.boardId !== boardId) return true;
  return (existing as { updatedAt?: unknown }).updatedAt !== stamp.updatedAt;
}
