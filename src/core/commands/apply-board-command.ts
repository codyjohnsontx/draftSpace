import type { Draft } from "immer";
import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement, Connector, ConnectorMutablePatch } from "@/core/elements/types";
import { connectorsTouching } from "@/core/connectors/routing";
import type { BoardCommand, BoardUpdatePatch, ElementMutablePatch } from "./board-command";

const mutableElementKeys = [
  "x", "y", "width", "height", "rotation", "groupIds", "locked", "hidden", "opacity",
  "strokeColor", "strokeWidth", "strokeStyle", "fillColor", "fillStyle", "roughness", "boundTextId",
  "nodeKind", "layer", "label",
] as const;

const mutableConnectorKeys = ["kind", "label", "strokeColor", "strokeWidth", "locked"] as const;

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

function applyConnectorPatch(connector: Draft<Connector>, patch: ConnectorMutablePatch, expected?: ConnectorMutablePatch): boolean {
  let changed = false;
  const target = connector as unknown as Record<string, unknown>;
  const expectedValues = expected as Record<string, unknown> | undefined;
  const patchValues = patch as Record<string, unknown>;
  mutableConnectorKeys.forEach((key) => {
    if (!(key in patchValues)) return;
    if (expectedValues && key in expectedValues && !valuesEqual(target[key], expectedValues[key])) return;
    if (!valuesEqual(target[key], patchValues[key])) {
      target[key] = patchValues[key];
      changed = true;
    }
  });
  return changed;
}

function connectorsEqual(a: Connector, b: Connector): boolean {
  return a.id === b.id && a.from.elementId === b.from.elementId && a.from.port === b.from.port
    && a.to.elementId === b.to.elementId && a.to.port === b.to.port
    && a.kind === b.kind && a.label === b.label && a.strokeColor === b.strokeColor
    && a.strokeWidth === b.strokeWidth && a.locked === b.locked;
}

/** Inserts connectors whose endpoints exist; used by connectors.create and cascade-restoring elements.create. */
function insertConnectors(board: Draft<BoardDocument>, connectors: Connector[], insertionIndexes?: number[]): boolean {
  let changed = false;
  connectors.forEach((connector, index) => {
    if (board.connectors[connector.id]) return;
    if (!board.elements[connector.from.elementId] || !board.elements[connector.to.elementId]) return;
    const insertionIndex = insertionIndexes?.[index];
    if (insertionIndex === undefined || !Number.isInteger(insertionIndex) || insertionIndex < 0 || insertionIndex > board.connectorIds.length) board.connectorIds.push(connector.id);
    else board.connectorIds.splice(insertionIndex, 0, connector.id);
    board.connectors[connector.id] = connector;
    changed = true;
  });
  return changed;
}

function matchesBoardExpected(board: Draft<BoardDocument>, expected: BoardUpdatePatch | undefined, key: "name" | keyof BoardDocument["preferences"]): boolean {
  if (!expected) return true;
  if (key === "name") return expected.name === undefined || board.name === expected.name;
  return expected.preferences?.[key] === undefined || board.preferences[key] === expected.preferences[key];
}

export function applyBoardCommand(board: Draft<BoardDocument>, command: BoardCommand): boolean {
  let changed = false;
  if (command.type === "elements.create") {
    const maximumInsertionIndex = board.elementIds.length + command.elements.length - 1;
    const orderedElements = command.elements.map((element, inputIndex) => ({ element, inputIndex, insertionIndex: command.insertionIndexes?.[inputIndex] }));
    orderedElements.sort((a, b) => {
      const aValid = Number.isInteger(a.insertionIndex) && a.insertionIndex! >= 0 && a.insertionIndex! <= maximumInsertionIndex;
      const bValid = Number.isInteger(b.insertionIndex) && b.insertionIndex! >= 0 && b.insertionIndex! <= maximumInsertionIndex;
      if (aValid !== bValid) return aValid ? -1 : 1;
      if (aValid && bValid && a.insertionIndex !== b.insertionIndex) return a.insertionIndex! - b.insertionIndex!;
      return a.inputIndex - b.inputIndex;
    });
    orderedElements.forEach(({ element, insertionIndex }) => {
      if (board.elements[element.id]) return;
      if (insertionIndex === undefined || insertionIndex < 0 || insertionIndex > board.elementIds.length) board.elementIds.push(element.id);
      else board.elementIds.splice(insertionIndex, 0, element.id);
      board.elements[element.id] = element;
      changed = true;
    });
    if (command.connectors?.length && insertConnectors(board, command.connectors, command.connectorInsertionIndexes)) changed = true;
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
    // A connector without both endpoints is meaningless; deleting a shape takes its edges with it.
    const orphaned = connectorsTouching(board, deleted);
    if (orphaned.length) {
      const orphanedSet = new Set(orphaned);
      board.connectorIds = board.connectorIds.filter((id) => !orphanedSet.has(id));
      orphaned.forEach((id) => { delete board.connectors[id]; });
    }
    return true;
  }
  if (command.type === "connectors.create") return insertConnectors(board, command.connectors, command.insertionIndexes);
  if (command.type === "connectors.delete") {
    const deleted = new Set(command.connectorIds.filter((id) => {
      const connector = board.connectors[id];
      const expected = command.expectedConnectors?.[id];
      return Boolean(connector) && (!expected || connectorsEqual(connector!, expected));
    }));
    if (!deleted.size) return false;
    board.connectorIds = board.connectorIds.filter((id) => !deleted.has(id));
    deleted.forEach((id) => { delete board.connectors[id]; });
    return true;
  }
  if (command.type === "connectors.update") {
    command.updates.forEach(({ connectorId, patch, expected }) => {
      const connector = board.connectors[connectorId];
      if (connector && applyConnectorPatch(connector, patch, expected)) changed = true;
    });
    return changed;
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
