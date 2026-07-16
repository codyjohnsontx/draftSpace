import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import type { BoardDocument } from "@/core/board/types";

enablePatches();

export type HistoryEntry = { label: string; forward: Patch[]; inverse: Patch[] };
export type HistoryState = { undo: HistoryEntry[]; redo: HistoryEntry[] };
export const emptyHistory = (): HistoryState => ({ undo: [], redo: [] });

export function transact(board: BoardDocument, label: string, recipe: (draft: BoardDocument) => void) {
  const [next, forward, inverse] = produceWithPatches(board, recipe);
  return { next, entry: forward.length ? { label, forward, inverse } : null };
}

export function pushHistory(history: HistoryState, entry: HistoryEntry, max = 100): HistoryState {
  return { undo: [...history.undo, entry].slice(-max), redo: [] };
}

export function undoBoard(board: BoardDocument, history: HistoryState) {
  const entry = history.undo.at(-1);
  if (!entry) return { board, history };
  return { board: applyPatches(board, entry.inverse), history: { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] } };
}

export function redoBoard(board: BoardDocument, history: HistoryState) {
  const entry = history.redo.at(-1);
  if (!entry) return { board, history };
  return { board: applyPatches(board, entry.forward), history: { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) } };
}
