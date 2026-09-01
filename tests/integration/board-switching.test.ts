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

/**
 * Freezes the clock every document mutation stamps itself with, so two mutations land in one tick.
 * Storage and timers are untouched, which leaves exactly one variable under test.
 */
let frozenNow: string | null = null;
vi.mock("@/core/board/factory", async (importActual) => {
  const actual = await importActual<typeof import("@/core/board/factory")>();
  return { ...actual, now: () => frozenNow ?? actual.now() };
});

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

/**
 * Runs `open` with this tab's lock acquisition broken, the way a browser that has stopped
 * granting locks breaks a claim mid-handover. It throws rather than rejecting: a refusal already
 * means another tab holds the board and leaves this one read-only, while a throw escapes the
 * lease and reaches the caller with the outgoing claim already let go. jsdom exposes no Web Locks
 * API, so removing the stand-in afterwards puts the tab back to claiming boards outright.
 */
async function withTheClaimBroken<T>(open: () => Promise<T>): Promise<T> {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: () => { throw new DOMException("Test broke this claim", "NotSupportedError"); } },
  });
  try { return await open(); } finally { Reflect.deleteProperty(navigator, "locks"); }
}

/** The failed-handover state: no claim, no coordinator, and the board the user picked never arrived. */
async function intoTheFailedHandover(session: Awaited<ReturnType<typeof openDraftspace>>, pickedId: string) {
  let outcome: OpenBoardOutcome = "opened";
  await withTheClaimBroken(async () => {
    await act(async () => { outcome = await session.result.current.openBoard(pickedId); });
  });
  expect(outcome).toBe("handover-failed");
  expect(usePersistenceStore.getState().status).toBe("session-only");
}

/** One shape, the way a user's hand puts work on the board that only this tab is holding. */
const draw = (x: number) => act(async () => { useBoardStore.getState().createShape("rectangle", { x, y: 10, width: 80, height: 60 }); });

/**
 * A record stored before documents carried a `stateId`, written raw the way it sits in a browser
 * that has been open since before the field existed. `createBoard` always sets one now, and
 * nothing rewrites a v3 record that only wants defaults, so the only way to get one is to take
 * the field back out and put the object in storage unparsed.
 */
async function seedLegacyBoard(name: string): Promise<BoardDocument> {
  const board = createBoard(name);
  const legacy: Record<string, unknown> = { ...board };
  delete legacy.stateId;
  const db = await openDB("draftspace", 1);
  await db.put("boards", legacy);
  db.close();
  return board;
}

/** Replaces a stored record with one no schema will parse, the way another tab damaging it would. */
async function damage(boardId: string) {
  const db = await openDB("draftspace", 1);
  await db.put("boards", { id: boardId, fileFormat: "draftspace/board", schemaVersion: 3, updatedAt: new Date().toISOString(), damaged: true });
  db.close();
}

beforeEach(async () => {
  frozenNow = null;
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
    // Not "unsaved-work": nothing tried and failed here, so the row has to name the way back
    // rather than report a save this tab never attempted.
    expect(outcome).toBe("not-saving");
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
    expect(outcome).toBe("not-saving");
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
    await repository.update({ ...original, name: "Advanced elsewhere", stateId: crypto.randomUUID(), updatedAt: new Date(Date.now() + 5000).toISOString() });

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
   * The write is the only thing that can say the copy exists, so the stamp waits for it. Recording
   * the copy as stored alongside the setBoard that puts it on screen told the switcher that a draft
   * storage had just refused was one it already held, and the next pick discarded it - the work the
   * rescue exists to keep, thrown away without a refusal, out of the path that exists to save it.
   */
  it("refuses to leave a rescued copy storage would not take", async () => {
    const repository = new IndexedDbBoardRepository();
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();

    // Another tab advanced the stored record, which is what sends the retry to a copy rather than
    // letting it write over work this tab never saw.
    await repository.update({ ...first, name: "Advanced elsewhere", stateId: crypto.randomUUID(), updatedAt: new Date(Date.now() + 5000).toISOString() });

    // Work only this tab is holding, and no autosave that can take it.
    const update = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await draw(200);

    // Storage has no room for the copy either, which is the failure the rescue path exists for.
    const create = vi.spyOn(IndexedDbBoardRepository.prototype, "create").mockRejectedValue(new Error("QuotaExceededError"));
    await act(async () => { await session.result.current.retryStorage(); });

    const copy = useBoardStore.getState().board!;
    expect(copy.id).not.toBe(first.id);
    expect(copy.name).toBe("Original board (recovered copy)");
    expect(copy.elementIds).toHaveLength(1);
    expect(usePersistenceStore.getState().status).toBe("session-only");
    // The copy is in this tab and nowhere else: storage was asked for it and refused.
    expect(await repository.list()).toHaveLength(2);

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("not-saving");
    // The copy is still on screen with its work, rather than abandoned behind a switch.
    expect(useBoardStore.getState().board?.id).toBe(copy.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
    expect(localStorage.getItem(LAST_BOARD)).toBe(first.id);
    session.unmount(); create.mockRestore(); update.mockRestore();
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

    await repository.update({ ...original, name: "Advanced elsewhere", stateId: crypto.randomUUID(), updatedAt: new Date(Date.now() + 5000).toISOString() });
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

  /**
   * The stamp is what says whether the stored record moved on since this tab last agreed with it,
   * and the autosave coordinator wrote without refreshing it. A tab that autosaved, lost its claim
   * mid-switch, and then retried storage compared against a stamp older than its own last write,
   * read its own work back as another tab's, and forked a "(recovered copy)" beside a board that
   * nothing else had touched. One board became two.
   */
  it("writes the board back where it was after a failed handover, rather than forking a copy", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));

    // A real autosave, so the stored record is one this tab wrote rather than one it only read.
    await draw(10);
    await waitFor(async () => expect((await storedBoard(first.id)).elementIds).toHaveLength(1), { timeout: 3000 });

    await intoTheFailedHandover(session, second.id);
    // Work only this tab holds, which is what "Retry storage" exists to keep.
    await draw(200);
    await act(async () => { await session.result.current.retryStorage(); });

    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.name).toBe("Original board");
    expect(usePersistenceStore.getState().status).toBe("saved");
    expect(usePersistenceStore.getState().notice).toBeNull();
    expect((await storedBoard(first.id)).elementIds).toHaveLength(2);
    // The whole of storage, so a second record cannot hide behind the board that is open.
    expect(await new IndexedDbBoardRepository().list()).toHaveLength(2);
    session.unmount();
  });

  /**
   * The other half of that state. The switch that broke settled the outgoing board on its way out,
   * so the tab it stranded holds a board storage already has - and every later pick was refused
   * anyway, because the gate read "no coordinator" as "work nothing will write". That left the
   * storage retry as the only way out, which is where the fork above came from.
   */
  it("lets a tab whose claim broke mid-switch pick a board again", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));
    await draw(10);
    await waitFor(async () => expect((await storedBoard(first.id)).elementIds).toHaveLength(1), { timeout: 3000 });

    await intoTheFailedHandover(session, second.id);
    expect(useBoardStore.getState().board?.id).toBe(first.id);

    let outcome: OpenBoardOutcome = "not-saving";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("opened");
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect(usePersistenceStore.getState().status).toBe("saved");
    expect(usePersistenceStore.getState().boardAccess).toBe("owner");
    // Nothing was abandoned on the way: the board it left is in storage with the work it held.
    expect((await storedBoard(first.id)).elementIds).toHaveLength(1);
    session.unmount();
  });

  /** And when there really is work nothing will write, the row says so and names the way back. */
  it("tells the user the open board is not being saved when that holds the switch back", async () => {
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));
    await intoTheFailedHandover(session, second.id);
    await draw(200);

    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("not-saving");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);

    render(createElement(BoardSwitcher, { controller: session.result.current }));
    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Recovered copy/ }));
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: /Recovered copy/ })).toHaveTextContent("not saving the open board"));
    // The menu stays up to say it, rather than closing over a click that changed nothing.
    expect(screen.getByRole("menu", { name: "Boards in this browser" })).toBeVisible();
    session.unmount();
  });

  /**
   * The same stale-stamp fork by a different route, and the reason the stamp now describes the
   * board on screen rather than only the boards this tab writes. `openBoard` recorded it after the
   * last-opened key, on the owner path alone, so a browser with no room for that key left the
   * picked board on screen under the previous board's stamp - and the retry read this tab's own
   * board as one it had never seen.
   */
  it("does not fork the board when a full storage key left the switch half-finished", async () => {
    const { second } = await seedTwoBoards();
    const session = await openDraftspace();
    const quota = new Error("full"); quota.name = "QuotaExceededError";
    const remember = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quota; });
    await act(async () => { await session.result.current.openBoard(second.id); });
    remember.mockRestore();
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect(usePersistenceStore.getState().status).toBe("session-only");

    await act(async () => { await session.result.current.retryStorage(); });
    expect(useBoardStore.getState().board?.id).toBe(second.id);
    expect(useBoardStore.getState().board?.name).toBe("Recovered copy");
    expect(await new IndexedDbBoardRepository().list()).toHaveLength(2);
    session.unmount();
  });

  /**
   * The same fork again, on the boards a user already has. A v3 record that only wants defaults is
   * never rewritten, so it stays in storage with no `stateId` while the document it parses to
   * carries the sentinel. Comparing the raw record against a stamp taken from that document read
   * this tab's own untouched board as another tab's work, and the retry forked a copy of it - on
   * every board stored before the field existed, which is the one case the tests above cannot see,
   * because `createBoard` always sets a `stateId`.
   */
  it("does not fork a board stored before documents carried a stateId", async () => {
    const repository = new IndexedDbBoardRepository();
    const open = createBoard("Original board");
    await repository.create(open);
    localStorage.setItem(LAST_BOARD, open.id);
    const legacy = await seedLegacyBoard("Legacy board");
    expect((await storedBoard(legacy.id) as unknown as Record<string, unknown>).stateId).toBeUndefined();

    const session = await openDraftspace();
    // The full-storage-key route onto the legacy board: it reaches the screen, and the write of
    // the last-opened key strands the tab in session-only with that board on it.
    const quota = new Error("full"); quota.name = "QuotaExceededError";
    const remember = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quota; });
    await act(async () => { await session.result.current.openBoard(legacy.id); });
    remember.mockRestore();
    expect(useBoardStore.getState().board?.id).toBe(legacy.id);
    expect(usePersistenceStore.getState().status).toBe("session-only");

    await act(async () => { await session.result.current.retryStorage(); });

    // Written back where it was: same board id, no copy beside it, and storage no larger.
    expect(useBoardStore.getState().board?.id).toBe(legacy.id);
    expect(useBoardStore.getState().board?.name).toBe("Legacy board");
    expect(usePersistenceStore.getState().status).toBe("saved");
    expect(await new IndexedDbBoardRepository().list()).toHaveLength(2);
    session.unmount();
  });

  /**
   * `updatedAt` used to be the stamp's currency, and `now()` has millisecond resolution, so two
   * mutations inside one clock tick share it. A tab that had written the first and was holding the
   * second read its own unsaved work as a draft storage already had, and the switch discarded it -
   * silently, which is the whole class this line of work exists to remove. Constructed rather than
   * argued: with the clock pinned this reproduced against `updatedAt` every time.
   *
   * `stateId` is replaced by every mutation, so the two states differ whatever the clock says.
   */
  it("refuses the switch when the unsaved mutation shares a clock tick with the stored one", async () => {
    frozenNow = "2026-01-01T00:00:00.000Z";
    const { first, second } = await seedTwoBoards();
    const session = await openDraftspace();
    await waitFor(() => expect(usePersistenceStore.getState().boards).toHaveLength(2));

    // Mutation A, written by autosave, so the stamp records it.
    await draw(10);
    await waitFor(async () => expect((await storedBoard(first.id)).elementIds).toHaveLength(1), { timeout: 3000 });
    const stored = await storedBoard(first.id);

    await intoTheFailedHandover(session, second.id);

    // Mutation B, same clock tick as A, and nothing left to write it.
    await draw(200);
    const board = useBoardStore.getState().board!;
    // The collision itself, which is the precondition the old currency could not survive.
    expect(board.updatedAt).toBe(stored.updatedAt);

    // The behaviour first, so reverting the currency fails this on the switch rather than on a
    // field that would not exist there.
    let outcome: OpenBoardOutcome = "opened";
    await act(async () => { outcome = await session.result.current.openBoard(second.id); });
    expect(outcome).toBe("not-saving");
    expect(useBoardStore.getState().board?.id).toBe(first.id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(2);
    // And the mechanism that made it possible: the two states differ whatever the clock said.
    expect(board.stateId).not.toBe(stored.stateId);
    session.unmount();
  });

  /** The same collision on the other side: a record another tab advanced inside one tick. */
  it("still sees a record another tab advanced inside one clock tick", async () => {
    frozenNow = "2026-01-01T00:00:00.000Z";
    const repository = new IndexedDbBoardRepository();
    const original = createBoard("Original board");
    await repository.create(original);
    localStorage.setItem(LAST_BOARD, original.id);
    const session = await openDraftspace();

    // Another tab writes, in the same tick this tab last agreed with, so `updatedAt` is unchanged.
    const advanced = { ...original, name: "Advanced elsewhere", stateId: crypto.randomUUID() };
    await repository.update(advanced);
    expect(advanced.updatedAt).toBe(original.updatedAt);

    const failing = vi.spyOn(IndexedDbBoardRepository.prototype, "update").mockRejectedValue(new Error("QuotaExceededError"));
    await draw(10);
    failing.mockRestore();
    await act(async () => { await session.result.current.retryStorage(); });

    // The other tab's work is untouched and this tab's draft became a copy beside it.
    expect(useBoardStore.getState().board?.id).not.toBe(original.id);
    expect(useBoardStore.getState().board?.name).toBe("Original board (recovered copy)");
    expect((await storedBoard(original.id)).name).toBe("Advanced elsewhere");
    session.unmount();
  });
});
