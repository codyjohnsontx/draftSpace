import type { Draft } from "immer";
import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement } from "@/core/elements/types";
import type { BoardCommand, BoardUpdatePatch, ElementMutablePatch } from "./board-command";

const mutableElementKeys = [
  "x", "y", "width", "height", "rotation", "groupIds", "locked", "hidden", "opacity",
  "strokeColor", "strokeWidth", "strokeStyle", "fillColor", "fillStyle", "roughness", "boundTextId",
] as const;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => value === b[index]);
  return Object.is(a, b);
}

function applyElementPatch(element: Draft<CanvasElement>, patch: ElementMutablePatch, expected?: ElementMutablePatch): boolean {
  let changed = false;
  const target = element as unknown as Record<string, unknown>;
  const expectedValues = expected as Record<string, unknown> | undefined;
  const patchValues = patch as Record<string, unknown>;
  mutableElementKeys.forEach((key) => {
    if (!(key in patchValues)) return;
    if (expectedValues && key in expectedValues && !valuesEqual(target[key], expectedValues[key])) return;
    if (!valuesEqual(target[key], patchValues[key])) {
      target[key] = patchValues[key];
      changed = true;
    }
  });
  if (element.type === "rectangle" && patch.cornerRadius !== undefined) {
    if ((expected?.cornerRadius === undefined || element.cornerRadius === expected.cornerRadius) && element.cornerRadius !== patch.cornerRadius) {
      element.cornerRadius = patch.cornerRadius;
      changed = true;
    }
  }
  return changed;
}

function elementsEqual(a: CanvasElement, b: CanvasElement): boolean {
  const aRecord = a as unknown as Record<string, unknown>;
  const bRecord = b as unknown as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return keys.length === Object.keys(bRecord).length && keys.every((key) => valuesEqual(aRecord[key], bRecord[key]));
}

function matchesBoardExpected(board: Draft<BoardDocument>, expected: BoardUpdatePatch | undefined, key: "name" | keyof BoardDocument["preferences"]): boolean {
  if (!expected) return true;
  if (key === "name") return expected.name === undefined || board.name === expected.name;
  return expected.preferences?.[key] === undefined || board.preferences[key] === expected.preferences[key];
}

export function applyBoardCommand(board: Draft<BoardDocument>, command: BoardCommand): boolean {
  let changed = false;
  if (command.type === "elements.create") {
    command.elements.forEach((element, index) => {
      if (board.elements[element.id]) return;
      const insertionIndex = command.insertionIndexes?.[index];
      if (insertionIndex === undefined || insertionIndex < 0 || insertionIndex > board.elementIds.length) board.elementIds.push(element.id);
      else board.elementIds.splice(insertionIndex, 0, element.id);
      board.elements[element.id] = element;
      changed = true;
    });
    return changed;
  }
  if (command.type === "elements.delete") {
    const deleted = new Set(command.elementIds.filter((id) => {
      const element = board.elements[id];
      const expected = command.expectedElements?.[id];
      return Boolean(element) && (!expected || elementsEqual(element!, expected));
    }));
    if (!deleted.size) return false;
    board.elementIds = board.elementIds.filter((id) => !deleted.has(id));
    deleted.forEach((id) => { delete board.elements[id]; });
    return true;
  }
  if (command.type === "elements.update") {
    command.updates.forEach(({ elementId, patch, expected }) => {
      const element = board.elements[elementId];
      if (element && applyElementPatch(element, patch, expected)) changed = true;
    });
    return changed;
  }
  if (command.patch.name !== undefined && matchesBoardExpected(board, command.expected, "name")) {
    const name = command.patch.name.trim() || "Untitled board";
    if (board.name !== name) { board.name = name; changed = true; }
  }
  if (command.patch.preferences) {
    (Object.keys(command.patch.preferences) as Array<keyof BoardDocument["preferences"]>).forEach((key) => {
      const value = command.patch.preferences?.[key];
      if (value !== undefined && matchesBoardExpected(board, command.expected, key)) {
        const preferences = board.preferences as unknown as Record<string, unknown>;
        if (!valuesEqual(preferences[key], value)) { preferences[key] = value; changed = true; }
      }
    });
  }
  return changed;
}
