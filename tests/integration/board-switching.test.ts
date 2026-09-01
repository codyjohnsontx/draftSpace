import "fake-indexeddb/auto";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { deleteDB, openDB } from "idb";
import { BoardSwitcher } from "@/components/app-shell/board-switcher";
import { PersistenceStatus } from "@/components/app-shell/persistence-status";
import { createBoard } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { emptyHistory } from "@/features/history/history";
import { useBoardPersistence, type OpenBoardOutcome } from "@/hooks/use-board-persistence";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import { useSessionStore } from "@/stores/session-store";

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

/** Replaces a stored record with one no schema will parse, the way another tab damaging it would. */
async function damage(boardId: string) {
  const db = await openDB("draftspace", 1);
  await db.put("boards", { id: boardId, fileFormat: "draftspace/board", schemaVersion: 3, updatedAt: new Date().toISOString(), damaged: true });
  db.close();
}

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
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));
    await damage(second.id);

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("unreadable");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(localStorage.getItem(LAST_BOARD)).toBe(first.id);
    expect(usePersistenceStore.getState().status).not.toBe("recovery-required");
    // The damaged record is never rewritten, and its row survives the pick: dropping it here is
    // what used to close the menu over a click that did nothing. The next refresh removes it.
    expect(await storedBoard(second.id)).toMatchObject({ damaged: true });
    expect(usePersistenceStore.getState().boards.map((board) => board.id)).toEqual([second.id, first.id]);
    session.unmount();
  });

  it("tells the user on the row when the board they picked can no longer be read", async () => {
    const { second } = await seedTwoBoards();
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));
    render(createElement(BoardSwitcher, { controller: session.result.current }));
    await damage(second.id);

    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Recovered copy/ }));
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: /Recovered copy/ })).toHaveTextContent("can no longer be opened"));
    expect(screen.getByRole("menu", { name: "Boards in this browser" })).toBeVisible();
    session.unmount();
  });

  it("refuses to leave a board whose work storage will not take, and keeps that work", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    const update = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("unsaved-work");
    expect(update).toHaveBeenCalled();
    // The board that was being left is still open, still holding the work, and still says so.
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
    expect(localStorage.getItem(LAST_BOARD)).toBe(first.id);
    // The refused switch leaves the failure showing rather than a fresh "saving" that hides it.
    expect(usePersistenceStore.getState().status).toBe("failed");
    expect(usePersistenceStore.getState().error?.message).toBeTruthy();
    session.unmount(); update.mockRestore();
  });

  it("refuses to leave a board no coordinator is left to write", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    const update = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));

    // Retrying storage drains the coordinator before it writes, so a write that fails again drops
    // the session to storage-less with the board still open and its work still only in this tab.
    await act(async () => { await session.result.current.retryStorage(); });
    expect(usePersistenceStore.getState().status).toBe("session-only");
    const sessionOnlyError = usePersistenceStore.getState().error;

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("unsaved-work");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
    expect(localStorage.getItem(LAST_BOARD)).toBe(first.id);
    expect(usePersistenceStore.getState().status).toBe("session-only");
    expect(usePersistenceStore.getState().error).toBe(sessionOnlyError);
    session.unmount(); update.mockRestore();
  });

  it("does not redo a write the storage retry already made, or refuse the switch when it fails", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });

    // The board's autosave fails, which is what puts "Retry storage" in front of the user.
    const failing = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await act(async () => { await session.result.current.retrySave(); });
    failing.mockRestore();

    // The retry then succeeds and writes the board itself, so every edit is on disk.
    await act(async () => { await session.result.current.retryStorage(); });
    expect(usePersistenceStore.getState().status).toBe("saved");
    expect((await storedBoard(first.id)).elementIds).toHaveLength(1);
    const persistedRevision = useBoardStore.getState().revision;
    expect(persistedRevision).toBeGreaterThan(0);

    // Switching now must not write the outgoing board again: storage already holds that revision.
    const update = vi.spyOn(IndexedDbBoardRepository.prototype, "update");
    let outcome: OpenBoardOutcome = "unsaved-work";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("opened");
    expect(update).not.toHaveBeenCalled();
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    session.unmount(); update.mockRestore();
  });

  // A retry whose own write fails must still refuse the switch - the seeding above must not make
  // genuinely unsaved work look saved.
  it("still refuses the switch when the retry that seeded the coordinator did not persist", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    const update = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await act(async () => { await session.result.current.retryStorage(); });

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("unsaved-work");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    session.unmount(); update.mockRestore();
  });

  /**
   * The rescue writes the copy while this tab can edit again: its claim has landed by then, so the
   * canvas takes input for the whole of that write. The copy used to go on screen only after it,
   * so a shape drawn in the window was committed to the document being replaced and then thrown
   * away by the setBoard that followed, with the status reporting the work saved.
   */
  it("keeps an edit made while the rescued copy is still being written", async () => {
    const repository = new IndexedDbBoardRepository();
    const original = createBoard("Original board");
    await repository.create(original);
    localStorage.setItem(LAST_BOARD, original.id);
    const session = await openDraftspace();

    // Another tab advanced the stored record, which is what sends the retry to a copy rather than
    // letting it write over work this tab never saw.
    await repository.update({ ...original, name: "Advanced elsewhere", updatedAt: new Date(Date.now() + 5000).toISOString() });

    // Work this tab is holding that storage has not taken, which is what the copy exists to keep.
    const failing = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    failing.mockRestore();

    // The user draws while the copy is being created, the way an ordinary hand does.
    const create = vi.spyOn(IndexedDbBoardRepository.prototype, "create").mockImplementation(async (board) => {
      create.mockRestore();
      useBoardStore.getState().createShape("rectangle", { x: 200, y: 200, width: 40, height: 40 });
      await repository.create(board);
    });

    await act(async () => { await session.result.current.retryStorage(); });

    const copyId = useBoardStore.getState().board!.id;
    expect(copyId).not.toBe(original.id);
    expect(useBoardStore.getState().board?.name).toBe("Original board (recovered copy)");
    // The late shape is on the copy rather than lost with the document it replaced, and the tail
    // that reschedules anything past the write it reported saved puts it in storage too.
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(2);
    await waitFor(async () => expect((await storedBoard(copyId)).elementIds).toHaveLength(2), { timeout: 3000 });
    expect((await storedBoard(original.id)).elementIds).toHaveLength(0);
    session.unmount();
  });

  /**
   * `markSaved` deliberately preserves a notice, so nothing else retires it and a new board has to
   * do it itself. Without that, the "Saved as a copy" panel goes on naming - and offering a backup
   * of - a board that is no longer the one on screen.
   */
  it("stops naming the rescued copy once a new board is started", async () => {
    const repository = new IndexedDbBoardRepository();
    const original = createBoard("Original board");
    await repository.create(original);
    localStorage.setItem(LAST_BOARD, original.id);
    const session = await openDraftspace();

    await repository.update({ ...original, name: "Advanced elsewhere", updatedAt: new Date(Date.now() + 5000).toISOString() });
    const failing = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    failing.mockRestore();
    await act(async () => { await session.result.current.retryStorage(); });

    render(createElement(PersistenceStatus, { controller: session.result.current }));
    const copyId = useBoardStore.getState().board!.id;
    expect(screen.getByRole("button", { name: "Saved as a copy" })).toBeVisible();

    await act(async () => { await session.result.current.startNewBoard(); });

    expect(useBoardStore.getState().board?.id).not.toBe(copyId);
    expect(usePersistenceStore.getState().notice).toBeNull();
    expect(screen.queryByRole("button", { name: "Saved as a copy" })).not.toBeInTheDocument();
    expect(screen.getByText("Saved locally")).toBeVisible();
    session.unmount();
  });

  // A recovered copy is the same document under a new board id, so the two boards hold the SAME
  // element ids. That is what makes a leaked preview repaint - and finishPreview overwrite - the
  // wrong board, rather than being a theoretical id collision.
  it("does not carry a style preview onto a board that shares its element ids", async () => {
    const repository = new IndexedDbBoardRepository();
    const original = createBoard("Original board");
    await repository.create(original);
    localStorage.setItem(LAST_BOARD, original.id);
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });

    const open = useBoardStore.getState().board!;
    const sharedElementId = open.elementIds[0];
    const recoveredCopy = { ...open, id: crypto.randomUUID(), name: "Recovered copy", updatedAt: new Date(Date.now() + 1000).toISOString() };
    await repository.create(recoveredCopy);
    expect(recoveredCopy.elementIds).toContain(sharedElementId);

    // A style preview is live on the original board when the user picks the copy.
    act(() => {
      useSessionStore.getState().setStylePreview({ elementIds: [sharedElementId], patch: { fillColor: "#ff0000" } });
      useSessionStore.getState().setConnectorStylePreview({ connectorIds: ["whatever"], patch: { strokeColor: "#ff0000" } });
    });

    await act(async () => { await session.result.current.openBoard(recoveredCopy.id); });
    expect(useBoardStore.getState().board?.id).toBe(recoveredCopy.id);
    expect(useSessionStore.getState().stylePreview).toBeNull();
    expect(useSessionStore.getState().connectorStylePreview).toBeNull();
    session.unmount();
  });

  it("keeps the open board's history when storage throws during a pick", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    const undoDepth = useBoardStore.getState().history.undo.length;
    expect(undoDepth).toBeGreaterThan(0);
    const read = vi.spyOn(IndexedDbBoardRepository.prototype, "getRawById").mockRejectedValue(new Error("connection closed"));

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("unreadable");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
    expect(useBoardStore.getState().history.undo).toHaveLength(undoDepth);
    session.unmount(); read.mockRestore();
  });

  it("does not give up on storage when only reading the picked board failed", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await act(async () => { useBoardStore.getState().createShape("rectangle", { x: 10, y: 10, width: 80, height: 60 }); });
    const read = vi.spyOn(IndexedDbBoardRepository.prototype, "getRawById").mockRejectedValue(new Error("UnknownError"));

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    read.mockRestore();
    expect(outcome).toBe("unreadable");
    // Nothing was asked of the open board, so nothing about it changed: its autosave is still the
    // one running, and a transient read is no reason to warn that the tab has stopped saving.
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
    expect(usePersistenceStore.getState().status).not.toBe("session-only");

    // And the switcher still works: one such read must not refuse every later pick as unsaved work.
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("opened");
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect((await storedBoard(first.id)).elementIds).toHaveLength(1);
    session.unmount();
  });

  it("does not claim the picked board is unopenable when it is already on screen", async () => {
    const { second } = await seedTwoBoards();
    const session = await openDraftspace();
    const quota = new Error("full"); quota.name = "QuotaExceededError";
    const remember = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quota; });

    let outcome: OpenBoardOutcome = "unreadable";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    remember.mockRestore();
    expect(outcome).toBe("opened");
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect(usePersistenceStore.getState().status).toBe("session-only");
    // Everything that can throw once the board is on screen is a write, so full storage must say
    // so rather than claim the board could not be read.
    expect(usePersistenceStore.getState().error?.code).toBe("write-failed");
    expect(usePersistenceStore.getState().error?.message).toBe("Browser storage is full.");
    session.unmount();
  });
});
