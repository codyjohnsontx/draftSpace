import { create } from "zustand";
import type { BoardDocument } from "@/core/board/types";
import type { Bounds, CanvasElement, ShapeStylePatch, ShapeType } from "@/core/elements/types";
import type { Viewport } from "@/core/board/types";
import { createBoard, createShape, newId, now } from "@/core/board/factory";
import { emptyHistory, transact, type HistoryEntry, type HistoryState } from "@/features/history/history";
import { applyBoardCommand } from "@/core/commands/apply-board-command";
import { canDispatchLocalCommands, getLocalActorId, localCommandMetadata, type BoardCommand, type BoardCommandIntent, type BoardCommandMetadata, type BoardUpdatePatch, type ElementMutablePatch } from "@/core/commands/board-command";
import type { Patch } from "immer";

export type DispatchedBoardCommand = { command: BoardCommand; metadata: BoardCommandMetadata; forward: Patch[]; inverse: Patch[]; revision: number };
export type BoardCommandEvent = DispatchedBoardCommand & { origin: "local" | "remote" };
const commandObservers = new Set<(event: BoardCommandEvent) => void>();
export const subscribeToBoardCommands = (observer: (event: BoardCommandEvent) => void) => { commandObservers.add(observer); return () => commandObservers.delete(observer); };

type BoardStore = {
  board: BoardDocument | null;
  history: HistoryState;
  revision: number;
  setBoard: (board: BoardDocument) => void;
  dispatchCommand: (command: BoardCommand, metadata: BoardCommandMetadata, origin?: "local" | "remote", recordHistory?: boolean) => DispatchedBoardCommand | null;
  createShape: (type: ShapeType, bounds: Bounds) => string | null;
  deleteElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => string[];
  pasteElements: (elements: CanvasElement[]) => string[];
  applyElementStyles: (ids: readonly string[], patch: ShapeStylePatch, label?: string) => void;
  updateElements: (updates: Array<{ elementId: string; patch: ElementMutablePatch }>, label: string, intent: BoardCommandIntent) => void;
  updateBoard: (patch: Extract<BoardCommand, { type: "board.update" }>["patch"], label: string) => void;
  rename: (name: string) => void;
  persistViewport: (viewport: Viewport) => void;
  undo: (actorId?: string) => void;
  redo: (actorId?: string) => void;
};

function pickElementPatch(element: CanvasElement, patch: ElementMutablePatch): ElementMutablePatch {
  const result: Record<string, unknown> = {};
  Object.keys(patch).forEach((key) => { result[key] = (element as unknown as Record<string, unknown>)[key]; });
  return result as ElementMutablePatch;
}

function inverseBoardPatch(board: BoardDocument, patch: BoardUpdatePatch): BoardUpdatePatch {
  return {
    ...(patch.name !== undefined ? { name: board.name } : {}),
    ...(patch.preferences ? { preferences: Object.fromEntries(Object.keys(patch.preferences).map((key) => [key, board.preferences[key as keyof BoardDocument["preferences"]]])) } : {}),
  };
}

function createInverseCommand(board: BoardDocument, command: BoardCommand): BoardCommand {
  if (command.type === "elements.create") return { type: "elements.delete", elementIds: command.elements.map((element) => element.id), expectedElements: Object.fromEntries(command.elements.map((element) => [element.id, element])) };
  if (command.type === "elements.delete") {
    const elements = command.elementIds.flatMap((id) => board.elements[id] ? [board.elements[id]] : []);
    return { type: "elements.create", elements, insertionIndexes: elements.map((element) => board.elementIds.indexOf(element.id)) };
  }
  if (command.type === "elements.update") return { type: "elements.update", updates: command.updates.flatMap(({ elementId, patch }) => {
    const element = board.elements[elementId];
    return element ? [{ elementId, patch: pickElementPatch(element, patch), expected: patch }] : [];
  }) };
  return { type: "board.update", patch: inverseBoardPatch(board, command.patch), expected: command.patch };
}

function createRedoCommand(command: BoardCommand, inverse: BoardCommand): BoardCommand {
  if (command.type === "elements.delete") {
    const restored = inverse.type === "elements.create" ? inverse.elements : [];
    return { ...command, expectedElements: Object.fromEntries(restored.map((element) => [element.id, element])) };
  }
  if (command.type === "elements.update" && inverse.type === "elements.update") {
    const expected = new Map(inverse.updates.map((update) => [update.elementId, update.patch]));
    return { ...command, updates: command.updates.map((update) => ({ ...update, expected: expected.get(update.elementId) })) };
  }
  if (command.type === "board.update" && inverse.type === "board.update") return { ...command, expected: inverse.patch };
  return command;
}

function actorEntryIndex(entries: HistoryEntry[], actorId: string): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) if (entries[index].metadata?.actorId === actorId) return index;
  return -1;
}

function pushActorHistory(history: HistoryState, entry: HistoryEntry, max = 100): HistoryState {
  return {
    undo: [...history.undo, entry].slice(-max),
    redo: history.redo.filter((redoEntry) => redoEntry.metadata?.actorId !== entry.metadata?.actorId),
  };
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  board: null,
  history: emptyHistory(),
  revision: 0,
  setBoard: (board) => set({ board, history: emptyHistory(), revision: 0 }),
  dispatchCommand: (command, metadata, origin = "local", recordHistory = true) => {
    const { board, history, revision } = get();
    if (!board || (origin === "local" && !canDispatchLocalCommands())) return null;
    const inverse = createInverseCommand(board, command);
    const { next, entry } = transact(board, metadata.label, (draft) => { if (applyBoardCommand(draft, command)) draft.updatedAt = now(); }, command, metadata);
    if (!entry) return null;
    entry.inverseCommand = inverse;
    entry.redoCommand = createRedoCommand(command, inverse);
    const nextRevision = revision + 1;
    set({ board: next, history: recordHistory ? pushActorHistory(history, entry) : history, revision: nextRevision });
    const dispatched = { command, metadata, forward: entry.forward, inverse: entry.inverse, revision: nextRevision };
    commandObservers.forEach((observer) => observer({ ...dispatched, origin }));
    return dispatched;
  },
  createShape: (type, bounds) => {
    if (!get().board) return null;
    const element = createShape(type, bounds);
    return get().dispatchCommand({ type: "elements.create", elements: [element] }, localCommandMetadata(`Create ${type}`, "create")) ? element.id : null;
  },
  deleteElements: (ids) => { get().dispatchCommand({ type: "elements.delete", elementIds: ids }, localCommandMetadata("Delete selection", "delete")); },
  duplicateElements: (ids) => {
    const board = get().board; if (!board) return [];
    const copies = ids.map((id) => board.elements[id]).filter(Boolean).map((source) => ({ ...source, id: newId(), x: source.x + 20, y: source.y + 20, createdAt: now(), updatedAt: now() }));
    return get().dispatchCommand({ type: "elements.create", elements: copies }, localCommandMetadata("Duplicate selection", "duplicate")) ? copies.map((copy) => copy.id) : [];
  },
  pasteElements: (elements) => {
    const copies = elements.map((source) => ({ ...source, id: newId(), x: source.x + 20, y: source.y + 20, createdAt: now(), updatedAt: now() }));
    return get().dispatchCommand({ type: "elements.create", elements: copies }, localCommandMetadata("Paste", "paste")) ? copies.map((copy) => copy.id) : [];
  },
  applyElementStyles: (ids, patch, label = "Change shape style") => {
    get().updateElements(ids.map((elementId) => ({ elementId, patch })), label, "style");
  },
  updateElements: (updates, label, intent) => { get().dispatchCommand({ type: "elements.update", updates }, localCommandMetadata(label, intent)); },
  updateBoard: (patch, label) => { get().dispatchCommand({ type: "board.update", patch }, localCommandMetadata(label, patch.name === undefined ? "preferences" : "rename")); },
  rename: (name) => { get().updateBoard({ name }, "Rename board"); },
  persistViewport: (viewport) => {
    const { board, revision } = get();
    if (!board || !board.preferences.restoreViewport) return;
    if (board.viewport.x === viewport.x && board.viewport.y === viewport.y && board.viewport.zoom === viewport.zoom) return;
    set({ board: { ...board, viewport, updatedAt: now() }, revision: revision + 1 });
  },
  undo: (actorId = getLocalActorId()) => {
    const { history } = get(); if (!canDispatchLocalCommands()) return;
    const index = actorEntryIndex(history.undo, actorId); const entry = history.undo[index];
    if (!entry?.inverseCommand) return;
    const nextHistory = { undo: history.undo.filter((_, itemIndex) => itemIndex !== index), redo: [...history.redo, entry] };
    set({ history: nextHistory });
    get().dispatchCommand(entry.inverseCommand, localCommandMetadata(`Undo ${entry.label}`, "undo"), "local", false);
  },
  redo: (actorId = getLocalActorId()) => {
    const { history } = get(); if (!canDispatchLocalCommands()) return;
    const index = actorEntryIndex(history.redo, actorId); const entry = history.redo[index];
    if (!entry?.redoCommand) return;
    const nextHistory = { undo: [...history.undo, entry], redo: history.redo.filter((_, itemIndex) => itemIndex !== index) };
    set({ history: nextHistory });
    get().dispatchCommand(entry.redoCommand, localCommandMetadata(`Redo ${entry.label}`, "redo"), "local", false);
  },
}));

export { createBoard };
