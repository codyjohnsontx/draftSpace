import { create } from "zustand";
import type { BoardDocument } from "@/core/board/types";
import type { Bounds, CanvasElement } from "@/core/elements/types";
import { createBoard, createRectangle, newId, now } from "@/core/board/factory";
import { emptyHistory, pushHistory, redoBoard, transact, undoBoard, type HistoryState } from "@/features/history/history";

export type SaveStatus = "loading" | "saving" | "saved" | "failed" | "offline";

type BoardStore = {
  board: BoardDocument | null;
  history: HistoryState;
  saveStatus: SaveStatus;
  revision: number;
  setBoard: (board: BoardDocument) => void;
  setSaveStatus: (status: SaveStatus) => void;
  commit: (label: string, recipe: (draft: BoardDocument) => void) => void;
  createRectangle: (bounds: Bounds) => string | null;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  pasteElements: (elements: CanvasElement[]) => string[];
  rename: (name: string) => void;
  undo: () => void;
  redo: () => void;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  board: null,
  history: emptyHistory(),
  saveStatus: "loading",
  revision: 0,
  setBoard: (board) => set({ board, history: emptyHistory(), saveStatus: "saved", revision: 0 }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  commit: (label, recipe) => {
    const { board, history, revision } = get();
    if (!board) return;
    const { next, entry } = transact(board, label, (draft) => { recipe(draft); draft.updatedAt = now(); });
    if (entry) set({ board: next, history: pushHistory(history, entry), revision: revision + 1 });
  },
  createRectangle: (bounds) => {
    const element = createRectangle(bounds);
    get().commit("Create rectangle", (board) => { board.elementIds.push(element.id); board.elements[element.id] = element; });
    return element.id;
  },
  deleteElements: (ids) => get().commit("Delete selection", (board) => {
    const deleted = new Set(ids); board.elementIds = board.elementIds.filter((id) => !deleted.has(id));
    ids.forEach((id) => { delete board.elements[id]; });
  }),
  duplicateElements: (ids) => {
    const board = get().board; if (!board) return [];
    const copies = ids.map((id) => board.elements[id]).filter(Boolean).map((source) => ({ ...source, id: newId(), x: source.x + 20, y: source.y + 20, createdAt: now(), updatedAt: now() }));
    get().commit("Duplicate selection", (draft) => copies.forEach((copy) => { draft.elementIds.push(copy.id); draft.elements[copy.id] = copy; }));
    return copies.map((copy) => copy.id);
  },
  pasteElements: (elements) => {
    const copies = elements.map((source) => ({ ...source, id: newId(), x: source.x + 20, y: source.y + 20, createdAt: now(), updatedAt: now() }));
    get().commit("Paste", (draft) => copies.forEach((copy) => { draft.elementIds.push(copy.id); draft.elements[copy.id] = copy; }));
    return copies.map((copy) => copy.id);
  },
  rename: (name) => get().commit("Rename board", (board) => { board.name = name.trim() || "Untitled board"; }),
  undo: () => { const { board, history, revision } = get(); if (!board) return; const result = undoBoard(board, history); set({ ...result, revision: result.board === board ? revision : revision + 1 }); },
  redo: () => { const { board, history, revision } = get(); if (!board) return; const result = redoBoard(board, history); set({ ...result, revision: result.board === board ? revision : revision + 1 }); },
}));

export { createBoard };
