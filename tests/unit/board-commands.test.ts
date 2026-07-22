import { afterEach, describe, expect, it } from "vitest";
import { createBoard, createShape } from "@/core/board/factory";
import { parseBoardCommand, setLocalActorIdProvider, setLocalCommandAuthorizationProvider, type BoardCommandMetadata } from "@/core/commands/board-command";
import { useBoardStore } from "@/stores/board-store";

const metadata = (actorId: string, commandId: string): BoardCommandMetadata => ({ actorId, commandId, label: "Move", intent: "move" });

afterEach(() => {
  setLocalActorIdProvider(() => "local");
  setLocalCommandAuthorizationProvider(() => true);
  useBoardStore.setState({ board: null });
});

describe("board commands", () => {
  it("validates the shared command boundary", () => {
    expect(parseBoardCommand({ type: "elements.update", updates: [{ elementId: "one", patch: { x: 20 } }] })).not.toBeNull();
    expect(parseBoardCommand({ type: "elements.update", updates: [{ elementId: "one", patch: { madeUp: true } }] })).toBeNull();
  });

  it("blocks local mutations when the collaboration role is read-only", () => {
    useBoardStore.getState().setBoard(createBoard());
    setLocalCommandAuthorizationProvider(() => false);
    expect(useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 80 })).toBeNull();
    expect(useBoardStore.getState().board?.elementIds).toEqual([]);
  });

  it("undoes only the local actor's unchanged fields", () => {
    const board = createBoard();
    const element = createShape("rectangle", { x: 10, y: 20, width: 100, height: 80 });
    board.elements[element.id] = element; board.elementIds.push(element.id);
    useBoardStore.getState().setBoard(board);
    setLocalActorIdProvider(() => "alice");

    useBoardStore.getState().dispatchCommand({ type: "elements.update", updates: [{ elementId: element.id, patch: { x: 40, y: 50 } }] }, metadata("alice", "alice-move"));
    useBoardStore.getState().dispatchCommand({ type: "elements.update", updates: [{ elementId: element.id, patch: { x: 90 } }] }, metadata("bob", "bob-move"), "remote");
    useBoardStore.getState().undo("alice");

    expect(useBoardStore.getState().board?.elements[element.id]).toMatchObject({ x: 90, y: 20 });
    expect(useBoardStore.getState().history.undo.some((entry) => entry.metadata?.actorId === "bob")).toBe(true);
    expect(useBoardStore.getState().history.redo.some((entry) => entry.metadata?.actorId === "alice")).toBe(true);

    useBoardStore.getState().dispatchCommand({ type: "elements.update", updates: [{ elementId: element.id, patch: { width: 120 } }] }, metadata("bob", "bob-resize"), "remote");
    expect(useBoardStore.getState().history.redo.some((entry) => entry.metadata?.actorId === "alice")).toBe(true);
  });
});
