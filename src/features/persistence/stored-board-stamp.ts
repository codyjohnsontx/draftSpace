/**
 * The stored record a tab last agreed with.
 *
 * Holding the board's claim makes a write exclusive, not current: the claim says no other tab
 * is writing right now, never that this tab's copy is the newest one. A tab that reloads before
 * it writes closes that gap on its own. A tab that cannot reload, because the draft on screen is
 * unsaved work, needs the stamp instead, and it answers two questions with it:
 *
 * - has the stored record moved on, so a write here would land on someone else's work
 * - is the draft on screen one storage already holds, so letting go of it loses nothing
 *
 * `stateId` is the whole test for both. Every document mutation replaces it, so a record whose
 * stateId is not the stamped one carries work this tab has not seen, and a draft still carrying
 * the stamped one is a draft nothing has changed since the write.
 *
 * It is deliberately not `updatedAt`, which was the currency until a constructed test showed why
 * it cannot be: `now()` has millisecond resolution, so two mutations inside one clock tick share
 * an `updatedAt`, and a draft holding the second read as one storage already had - a switch then
 * discarded it silently. One currency for both questions, and one that cannot collide.
 */
export type StoredBoardStamp = { boardId: string; stateId: string };

/**
 * The `stateId` a document stored before the field existed parses to. The schema defaults to it
 * and a raw record carrying no field reads as it, so the parsed document and the record it was
 * read from speak one currency; two definitions of "no stateId" would report every board stored
 * before the field as another tab's work.
 */
export const NO_STATE_ID = "pre-state-id";

/** The stateId of a record read back unparsed, in the currency a parsed document stamps with. */
const storedStateId = (existing: object): unknown => (existing as { stateId?: unknown }).stateId ?? NO_STATE_ID;

export const boardStamp = (board: { id: string; stateId: string }): StoredBoardStamp =>
  ({ boardId: board.id, stateId: board.stateId });

/** Whether the stored record carries work this tab has never agreed with. */
export function storedRecordMovedOn(existing: unknown, boardId: string, stamp: StoredBoardStamp | null): boolean {
  if (existing === null || existing === undefined) return false;
  // No stamp for this board means this tab never saw a stored record for it, so whatever is
  // there was put there by someone else.
  if (!stamp || stamp.boardId !== boardId) return true;
  // Anything that is not a document is not a record this tab agreed with.
  if (typeof existing !== "object" || Array.isArray(existing)) return true;
  return storedStateId(existing) !== stamp.stateId;
}

/**
 * Whether this tab's copy of a board is the record storage holds, which is what a tab with no
 * coordinator left to write - one that gave up on storage, or one whose claim broke mid-handover -
 * has to know before it may let its board go.
 */
export function draftIsStored(board: { id: string; stateId: string }, stamp: StoredBoardStamp | null): boolean {
  if (!stamp || stamp.boardId !== board.id) return false;
  return board.stateId === stamp.stateId;
}
