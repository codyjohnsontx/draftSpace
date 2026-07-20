import { create } from "zustand";
import type { BoardDocument } from "@/core/board/types";
import type { Bounds, CanvasElement, ShapeType } from "@/core/elements/types";
import type { Viewport } from "@/core/board/types";
import { createBoard, createShape, newId, now } from "@/core/board/factory";
import { emptyHistory, pushHistory, redoBoard, transact, undoBoard, type HistoryState } from "@/features/history/history";

type BoardStore = {
  board: BoardDocument | null;
  history: HistoryState;
  revision: number;
  setBoard: (board: BoardDocument) => void;
  commit: (label: string, recipe: (draft: BoardDocument) => void) => void;
  createShape: (type: ShapeType, bounds: Bounds) => string | null;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  pasteElements: (elements: CanvasElement[]) => string[];
  rename: (name: string) => void;
  persistViewport: (viewport: Viewport) => void;
  undo: () => void;
  redo: () => void;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  board: null,
  history: emptyHistory(),
  revision: 0,
  setBoard: (board) => set({ board, history: emptyHistory(), revision: 0 }),
  commit: (label, recipe) => {
    const { board, history, revision } = get();
    if (!board) return;
    const { next, entry } = transact(board, label, (draft) => { recipe(draft); draft.updatedAt = now(); });
    if (entry) set({ board: next, history: pushHistory(history, entry), revision: revision + 1 });
  },
  createShape: (type, bounds) => {
    if (!get().board) return null;
    const element = createShape(type, bounds);
    get().commit(`Create ${type}`, (board) => { board.elementIds.push(element.id); board.elements[element.id] = element; });
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
  persistViewport: (viewport) => {
    const { board, revision } = get();
    if (!board || !board.preferences.restoreViewport) return;
    if (board.viewport.x === viewport.x && board.viewport.y === viewport.y && board.viewport.zoom === viewport.zoom) return;
    set({ board: { ...board, viewport, updatedAt: now() }, revision: revision + 1 });
  },
  undo: () => { const { board, history, revision } = get(); if (!board) return; const result = undoBoard(board, history); set({ ...result, revision: result.board === board ? revision : revision + 1 }); },
  redo: () => { const { board, history, revision } = get(); if (!board) return; const result = redoBoard(board, history); set({ ...result, revision: result.board === board ? revision : revision + 1 }); },
}));

export { createBoard };
