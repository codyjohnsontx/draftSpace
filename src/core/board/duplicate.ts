import type { BoardDocument } from "./types";
import type { CanvasElement, Connector } from "@/core/elements/types";
import { newId } from "@/lib/ids/new-id";

/**
 * Connectors whose both endpoints are inside the id set. One-legged edges stay
 * behind: copies must never bind back to the originals they were copied from.
 */
export function connectorsWithin(board: Pick<BoardDocument, "connectorIds" | "connectors">, elementIds: ReadonlySet<string>): Connector[] {
  return board.connectorIds
    .map((id) => board.connectors[id])
    .filter((connector): connector is Connector => Boolean(connector) && elementIds.has(connector.from.elementId) && elementIds.has(connector.to.elementId));
}

export type SelectionCopy = { elements: CanvasElement[]; connectors: Connector[] };

/**
 * Copies of the given elements and connectors under fresh ids, offset so the
 * copy lands beside its source. Connectors are rebound to the copied elements;
 * one whose endpoint has no copy (for example from a foreign clipboard payload)
 * is dropped rather than left pointing at an element outside the copy.
 */
export function copySelection(elements: CanvasElement[], connectors: Connector[], timestamp: string, offset = { x: 20, y: 20 }): SelectionCopy {
  const copiedIds = new Map(elements.map((element) => [element.id, newId()]));
  return {
    elements: elements.map((source) => ({ ...source, id: copiedIds.get(source.id)!, x: source.x + offset.x, y: source.y + offset.y, createdAt: timestamp, updatedAt: timestamp })),
    connectors: connectors.flatMap((source) => {
      const from = copiedIds.get(source.from.elementId);
      const to = copiedIds.get(source.to.elementId);
      return from && to ? [{ ...source, id: newId(), from: { ...source.from, elementId: from }, to: { ...source.to, elementId: to }, createdAt: timestamp, updatedAt: timestamp }] : [];
    }),
  };
}
