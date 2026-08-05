import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { useBoardStore } from "@/stores/board-store";
import { copyElements, readElements } from "@/features/clipboard/clipboard";
import type { BoardDocument } from "@/core/board/types";

/** Two rectangles joined by one connector, loaded into the store. */
function seedConnectedPair() {
  useBoardStore.getState().setBoard(createBoard() as BoardDocument);
  const aId = useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
  const bId = useBoardStore.getState().createShape("rectangle", { x: 300, y: 0, width: 100, height: 60 })!;
  const connectorId = useBoardStore.getState().createConnector({ elementId: aId, port: "auto" }, { elementId: bId, port: "auto" })!;
  return { aId, bId, connectorId };
}

const board = () => useBoardStore.getState().board!;

describe("duplicate keeps connectors attached", () => {
  let seeded: ReturnType<typeof seedConnectedPair>;
  beforeEach(() => { seeded = seedConnectedPair(); });

  it("rebinds a fully-selected connector to the copies under fresh ids", () => {
    const copies = useBoardStore.getState().duplicateElements([seeded.aId, seeded.bId]);
    expect(copies).toHaveLength(2);
    expect(board().elementIds).toHaveLength(4);
    expect(board().connectorIds).toHaveLength(2);
    const copied = board().connectors[board().connectorIds.find((id) => id !== seeded.connectorId)!];
    expect(copied.id).not.toBe(seeded.connectorId);
    expect(copies).toContain(copied.from.elementId);
    expect(copies).toContain(copied.to.elementId);
    const original = board().connectors[seeded.connectorId];
    expect(original.from.elementId).toBe(seeded.aId);
    expect(original.to.elementId).toBe(seeded.bId);
  });

  it("leaves a one-legged connector behind so the copy never binds back to the original", () => {
    const copies = useBoardStore.getState().duplicateElements([seeded.aId]);
    expect(copies).toHaveLength(1);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });

  it("duplicates a single unconnected shape exactly as before", () => {
    const loneId = useBoardStore.getState().createShape("ellipse", { x: 600, y: 0, width: 80, height: 80 })!;
    const copies = useBoardStore.getState().duplicateElements([loneId]);
    expect(copies).toHaveLength(1);
    const copy = board().elements[copies[0]];
    expect(copy).toMatchObject({ type: "ellipse", x: 620, y: 20, width: 80, height: 80 });
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });

  it("undoes a duplicate, copies and connector together, in one step", () => {
    useBoardStore.getState().duplicateElements([seeded.aId, seeded.bId]);
    useBoardStore.getState().undo();
    expect(board().elementIds).toEqual([seeded.aId, seeded.bId]);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
    useBoardStore.getState().redo();
    expect(board().elementIds).toHaveLength(4);
    expect(board().connectorIds).toHaveLength(2);
  });
});

describe("copy and paste keep connectors attached", () => {
  let seeded: ReturnType<typeof seedConnectedPair>;
  beforeEach(() => { seeded = seedConnectedPair(); });

  const selection = (ids: string[]) => ids.map((id) => board().elements[id]);

  it("pastes a fully-copied pair with a rebound connector under fresh ids", async () => {
    await copyElements(selection([seeded.aId, seeded.bId]), [board().connectors[seeded.connectorId]]);
    const pasted = useBoardStore.getState().pasteElements(await readElements());
    expect(pasted).toHaveLength(2);
    expect(board().elementIds).toHaveLength(4);
    expect(board().connectorIds).toHaveLength(2);
    const copied = board().connectors[board().connectorIds.find((id) => id !== seeded.connectorId)!];
    expect(pasted).toContain(copied.from.elementId);
    expect(pasted).toContain(copied.to.elementId);
  });

  it("drops a clipboard connector whose endpoint was not copied instead of binding back", async () => {
    await copyElements(selection([seeded.aId]), [board().connectors[seeded.connectorId]]);
    const pasted = useBoardStore.getState().pasteElements(await readElements());
    expect(pasted).toHaveLength(1);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });

  it("mints distinct ids on every paste of the same clipboard payload", async () => {
    await copyElements(selection([seeded.aId, seeded.bId]), [board().connectors[seeded.connectorId]]);
    const payload = await readElements();
    useBoardStore.getState().pasteElements(payload);
    useBoardStore.getState().pasteElements(payload);
    expect(board().elementIds).toHaveLength(6);
    expect(board().connectorIds).toHaveLength(3);
    expect(new Set(board().connectorIds).size).toBe(3);
  });

  it("undoes a paste, elements and connector together, in one step", async () => {
    await copyElements(selection([seeded.aId, seeded.bId]), [board().connectors[seeded.connectorId]]);
    useBoardStore.getState().pasteElements(await readElements());
    useBoardStore.getState().undo();
    expect(board().elementIds).toEqual([seeded.aId, seeded.bId]);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });
});

describe("the serialized clipboard payload", () => {
  let seeded: ReturnType<typeof seedConnectedPair>;
  let clipboardText: string;

  beforeEach(async () => {
    seeded = seedConnectedPair();
    clipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { clipboardText = value; }, readText: async () => clipboardText },
    });
    // Empties the in-session fallback, so anything a read returns came from the text.
    await copyElements([], []);
    clipboardText = "";
  });

  afterEach(() => { Reflect.deleteProperty(navigator, "clipboard"); });

  const selection = (ids: string[]) => ids.map((id) => board().elements[id]);

  it("reads back the elements and connectors it wrote", async () => {
    await copyElements(selection([seeded.aId, seeded.bId]), [board().connectors[seeded.connectorId]]);
    const written = clipboardText;
    expect(JSON.parse(written)).toMatchObject({ fileFormat: "draftspace/selection" });
    expect(JSON.parse(written).connectors).toHaveLength(1);
    await copyElements([], []);
    clipboardText = written;
    const payload = await readElements();
    expect(payload.elements.map((element) => element.id)).toEqual([seeded.aId, seeded.bId]);
    expect(payload.connectors).toHaveLength(1);
    expect(useBoardStore.getState().pasteElements(payload)).toHaveLength(2);
    expect(board().connectorIds).toHaveLength(2);
  });

  it("still parses an element-only payload written before connectors travelled", async () => {
    clipboardText = JSON.stringify({ fileFormat: "draftspace/selection", elements: selection([seeded.aId, seeded.bId]) });
    const payload = await readElements();
    expect(payload.elements).toHaveLength(2);
    expect(payload.connectors).toEqual([]);
    expect(useBoardStore.getState().pasteElements(payload)).toHaveLength(2);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });

  it("drops entries that fail the board schema and pastes the valid elements", async () => {
    clipboardText = JSON.stringify({
      fileFormat: "draftspace/selection",
      elements: [...selection([seeded.aId, seeded.bId]), { id: "crafted", type: "rectangle" }],
      connectors: [{ id: "crafted" }],
    });
    const payload = await readElements();
    expect(payload.elements).toHaveLength(2);
    expect(payload.connectors).toEqual([]);
    expect(useBoardStore.getState().pasteElements(payload)).toHaveLength(2);
    expect(board().elementIds).toHaveLength(4);
    expect(board().connectorIds).toEqual([seeded.connectorId]);
  });

  it("falls back to the session copy when the clipboard holds foreign text", async () => {
    await copyElements(selection([seeded.aId]), []);
    clipboardText = "not a draftspace payload";
    const payload = await readElements();
    expect(payload.elements.map((element) => element.id)).toEqual([seeded.aId]);
    expect(payload.connectors).toEqual([]);
  });
});
