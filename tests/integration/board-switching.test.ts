import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { deleteDB, openDB } from "idb";
import { createBoard } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { emptyHistory } from "@/features/history/history";
import { useBoardPersistence } from "@/hooks/use-board-persistence";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";

const LAST_BOARD = "draftspace:last-board";

/** Two stored boards, `first` opened, exactly as a browser that has ended up with more than one. */
async function seedTwoBoards() {
  const repository = new IndexedDbBoardRepository();
  const first = createBoard("Original board");
  const second = { ...createBoard("Recovered copy"), updatedAt: new Date(Date.now() + 1000).toISOString() };
  await repository.create(first); await repository.create(second);
  localStorage.setItem(LAST_BOARD, first.id);
  return { first, second };
}

/** Mounts persistence the way the shell does and waits for the board it opened. */
async function openDraftspace() {
  const hook = renderHook(() => useBoardPersistence());
  await waitFor(() => expect(useBoardStore.getState().board).not.toBeNull());
  return hook;
}

const storedBoard = async (id: string) => await new IndexedDbBoardRepository().getRawById(id) as BoardDocument;

beforeEach(async () => {
  await deleteDB("draftspace");
  localStorage.clear();
  useBoardStore.setState({ board: null, history: emptyHistory(), revision: 0 });
  usePersistenceStore.setState({ status: "loading", error: null, recovery: null, boards: [], lastSavedAt: null, savedRevision: 0, attemptedRevision: null });
});

describe("opening a second board", () => {
  it("offers every stored board and stays on the one that was picked across a reload", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    await waitFor(() => expect(usePersistenceStore.getState().boards.map((board) => board.id)).toEqual([second.id, first.id]));

    await act(async () => { await session.result.current.openBoard(second.id); });
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect(localStorage.getItem(LAST_BOARD)).toBe(second.id);

    // A reload: the shell mounts persistence again against the same stored state.
    session.unmount();
    useBoardStore.setState({ board: null, history: emptyHistory(), revision: 0 });
    const reloaded = await openDraftspace();
    expect(useBoardStore.getState().board?.id).toBe(second.id);

    // And the first board is still reachable from there, which is the whole point of the list.
    await act(async () => { await reloaded.result.current.openBoard(first.id); });
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    reloaded.unmount();
  });

  it("saves work still inside the autosave debounce before letting the board go", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    expect((await storedBoard(first.id)).elementIds).toHaveLength(0);

    await act(async () => { await session.result.current.openBoard(second.id); });
    expect((await storedBoard(first.id)).elementIds).toHaveLength(1);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(0);
    session.unmount();
  });

  it("resets history and selection so the board that was left cannot be undone into this one", async () => {
    const { second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    expect(useBoardStore.getState().history.undo).not.toHaveLength(0);

    await act(async () => { await session.result.current.openBoard(second.id); });
    expect(useBoardStore.getState().history.undo).toHaveLength(0);
    expect(useBoardStore.getState().revision).toBe(0);
    session.unmount();
  });

  it("picks up a board another tab added when this one comes back to the front", async () => {
    const repository = new IndexedDbBoardRepository();
    const only = createBoard("Only board");
    await repository.create(only); localStorage.setItem(LAST_BOARD, only.id);
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(1));

    await repository.create(createBoard("Started in another tab"));
    // jsdom reports a visible document, which is the state a returning tab is in.
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));
    session.unmount();
  });

  it("leaves the open board alone when the picked one can no longer be read", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    const db = await openDB("draftspace", 1);
    await db.put("boards", { id: second.id, fileFormat: "draftspace/board", schemaVersion: 3, updatedAt: new Date().toISOString(), damaged: true });
    db.close();

    let opened = true;
    await act(async () => { opened = await session.result.current.openBoard(second.id); });
    expect(opened).toBe(false);
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(localStorage.getItem(LAST_BOARD)).toBe(first.id);
    expect(usePersistenceStore.getState().status).not.toBe("recovery-required");
    // The damaged record is never rewritten, and it drops out of the list rather than being offered again.
    expect(await storedBoard(second.id)).toMatchObject({ damaged: true });
    await waitFor(() => expect(usePersistenceStore.getState().boards.map((board) => board.id)).toEqual([first.id]));
    session.unmount();
  });
});
