"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBoard, useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useSessionStore } from "@/stores/session-store";
import { useViewportStore } from "@/stores/viewport-store";
import { AutosaveCoordinator, type AutosaveEvent } from "@/features/persistence/autosave-coordinator";
import { loadBoardDocument } from "@/features/persistence/load-board-document";
import { downloadBackup, serializeBoardBackup, serializeRecoveryBackup, type BackupResult } from "@/features/persistence/backup";
import { normalizePersistenceError, persistenceError } from "@/features/persistence/persistence-errors";
import { boardClaimIsCurrent, claimBoard, releaseBoardClaim, type BoardLease } from "@/features/persistence/board-lease";
import { storedRecordMovedOn, type StoredBoardStamp } from "@/features/persistence/stored-board-stamp";
import { newId, now } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import { setBoardOwnershipProvider } from "@/core/commands/board-command";
import { performanceNow, recordPerformanceSample } from "@/features/performance/performance-monitor";

const LAST_BOARD = "draftspace:last-board";

// A tab that does not hold the board's lease cannot mutate the document, whatever the UI does.
setBoardOwnershipProvider(() => usePersistenceStore.getState().boardAccess === "owner");

const finishBackup = (result: BackupResult) => {
  if (!result.ok) { usePersistenceStore.getState().setError(result.error); return; }
  const download = downloadBackup(result);
  if (!download.ok) usePersistenceStore.getState().setError(download.error);
};

/**
 * Whether work that resumed after an await still stands where it started: acting for the same
 * claim, on the same document. The lease is the test for the claim rather than the board id,
 * which a switch away and back reuses, and the board id is the test for what is on screen.
 */
const stillHolds = (lease: BoardLease, boardId: string) =>
  boardClaimIsCurrent(lease) && useBoardStore.getState().board?.id === boardId;

/**
 * Whether a picked board is now the open one, and when it is not, what became of the pick: the
 * picked one could not be read, the open one still holds work storage would not take, or the open
 * board's claim was handed over and the picked one could not be claimed in its place.
 */
export type OpenBoardOutcome = "opened" | "unreadable" | "unsaved-work" | "handover-failed";

export type PersistenceController = {
  retrySave: () => Promise<void>;
  retryStorage: () => Promise<void>;
  startNewBoard: () => Promise<void>;
  openBoard: (boardId: string) => Promise<OpenBoardOutcome>;
  downloadRecovery: () => Promise<void>;
  downloadCurrentBackup: () => Promise<void>;
};

export function useBoardPersistence(): PersistenceController {
  const [repository] = useState(() => new IndexedDbBoardRepository());
  const coordinator = useRef<AutosaveCoordinator | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const revision = useBoardStore((state) => state.revision);
  const openBoardId = useBoardStore((state) => state.board?.id ?? null);
  const storedStamp = useRef<StoredBoardStamp | null>(null);

  /** Records the stored record this tab now agrees with, after reading or writing it. */
  const rememberStored = useCallback((board: BoardDocument) => {
    storedStamp.current = { boardId: board.id, updatedAt: board.updatedAt };
  }, []);

  const handleAutosaveEvent = useCallback((event: AutosaveEvent) => {
    const state = usePersistenceStore.getState();
    if (event.type === "saving") state.markSaving(event.revision);
    else if (event.type === "saved") state.markSaved(event.revision, event.savedAt);
    else state.markFailed(event.error);
  }, []);

  const drainCoordinator = useCallback(async () => {
    const current = coordinator.current;
    coordinator.current = null;
    await current?.drain();
  }, []);

  /**
   * The one gate the open board's work passes before anything lets go of it. A coordinator that
   * cannot be asked - because there is none, or because storage has already been given up on -
   * holds work nothing will ever write, so it answers the same as a write storage refused.
   */
  const settleOpenBoard = useCallback(async () => {
    // A tab that does not hold the board never accepted an edit, so it has no work to settle and
    // no coordinator to ask. Refusing its switch would strand it on a board it cannot edit.
    if (usePersistenceStore.getState().boardAccess !== "owner") return true;
    const outgoing = coordinator.current;
    if (!outgoing || usePersistenceStore.getState().status === "session-only") return false;
    return outgoing.settle();
  }, []);

  /** `savedRevision` is for the caller that already wrote the board itself; see retryStorage. */
  const startCoordinator = useCallback(async (savedRevision = 0) => {
    await drainCoordinator();
    const nextCoordinator = new AutosaveCoordinator({
      repository,
      getBoard: () => useBoardStore.getState().board,
      getRevision: () => useBoardStore.getState().revision,
      savedRevision,
      onStateChange: handleAutosaveEvent,
    });
    coordinator.current = nextCoordinator;
    return nextCoordinator;
  }, [drainCoordinator, handleAutosaveEvent, repository]);

  const flushViewport = useCallback(() => {
    if (viewportTimer.current !== null) clearTimeout(viewportTimer.current);
    viewportTimer.current = null;
    useBoardStore.getState().persistViewport(useViewportStore.getState().viewport);
  }, []);

  /**
   * A board already on screen is the work this mode exists to keep; only seed one when the
   * failure struck before anything was opened, since setBoard would drop history and viewport.
   */
  const enterSessionOnly = useCallback((error: unknown) => {
    // Nothing is written in this mode, so hand the board back rather than hold a lease this tab cannot use.
    releaseBoardClaim(); usePersistenceStore.getState().setBoardAccess("owner");
    if (!useBoardStore.getState().board) {
      const board = createBoard("Temporary draft");
      useBoardStore.getState().setBoard(board);
      useViewportStore.getState().setViewport(board.viewport);
    }
    usePersistenceStore.getState().enterSessionOnly(normalizePersistenceError(error, "read"));
  }, []);

  /** Re-reads which boards this browser holds. Failing to list them must never disturb the open board. */
  const refreshBoards = useCallback(async () => {
    try { usePersistenceStore.getState().setBoards(await repository.list()); }
    catch (error) { console.debug("Draftspace could not list local boards", error); }
  }, [repository]);

  /**
   * Runs when the owning tab lets the board go. Whatever it saved is the truth now, so the
   * stored document replaces this tab's stale copy before any editing is allowed. Skipping
   * that would simply move the overwrite later.
   */
  const takeOverBoard = useCallback(async (lease: BoardLease) => {
    const boardId = lease.boardId;
    const persistence = usePersistenceStore.getState();
    // This tab holds the lock from here on, so every path out of this function has to grant it
    // edit rights. Granting them only after the stored document is on screen is the point:
    // an edit accepted against the stale copy would be dropped by the reload that follows it.
    try {
      const result = loadBoardDocument(boardId, await repository.getRawById(boardId));
      // The tab may have switched boards while this promotion was in flight. The board id cannot
      // settle that on its own, because switching away and back reuses it, so this asks whether
      // the lease that started the promotion is still the claim the tab holds.
      if (!stillHolds(lease, boardId)) return;
      if (result.kind === "invalid") {
        persistence.setBoardAccess("owner");
        persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: result.issues }); return;
      }
      if (result.kind === "unsupported-version") {
        persistence.setBoardAccess("owner");
        persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "unsupported-version", issues: ["This board was created by a newer Draftspace schema."], schemaVersion: result.schemaVersion }); return;
      }
      // The viewport stays where the reader left it; only the document is replaced.
      if (result.kind === "ready") { useBoardStore.getState().setBoard(result.board); rememberStored(result.board); }
      await startCoordinator();
      // startCoordinator awaits, so the claim is proved once more before this tab is told it may
      // edit and save. A coordinator started for a board the tab no longer holds is disposed
      // rather than drained: draining flushes, and that write is what this guard exists to stop.
      if (!stillHolds(lease, boardId)) { coordinator.current?.dispose(); coordinator.current = null; return; }
      persistence.markSaved(useBoardStore.getState().revision, new Date().toISOString());
      // The one path that really is a handover, and the board is the one this tab was already
      // looking at, so it is the only one allowed to say another tab let this board go.
      persistence.markTakenOver(boardId);
    } catch (error) {
      console.error("Draftspace could not take over this board", error);
      // The catch resumes after an await like the two guards above it, and does the most
      // destructive thing in this hook: entering session-only releases whatever claim the tab
      // holds now, which after a switch is the claim on a board a coordinator is still saving.
      // A promotion whose claim is gone has nothing left to say about the session that replaced it.
      if (!stillHolds(lease, boardId)) return;
      enterSessionOnly(error);
    }
  }, [enterSessionOnly, rememberStored, repository, startCoordinator]);

  /** Claims the board for this tab, or opens read-only when another tab already holds it. */
  const claim = useCallback(async (boardId: string) => {
    // Edit rights are never wider than the lease actually held, mid-transition included.
    // claimBoard releases the outgoing lease before it acquires the next, so rights have to
    // narrow before that call rather than after it returns: in between, this tab holds no
    // claim, and commands dispatched against the board it just let go would be exactly the
    // overwrite the lease exists to prevent.
    const before = usePersistenceStore.getState().boardAccess;
    usePersistenceStore.getState().setBoardAccess("pending");
    try {
      const lease = await claimBoard({ boardId, onPromoted: takeOverBoard });
      usePersistenceStore.getState().setBoardAccess(lease.isOwner ? "owner" : "read-only");
      return lease;
    } catch (error) {
      // A claim that never settles must not leave the tab pending. Pending shows no banner and
      // refuses every edit, so a stuck one is a silent lockout: the caller decides what this tab
      // may do next, and it cannot decide anything from a state that says "ask again later".
      usePersistenceStore.getState().setBoardAccess(before);
      throw error;
    }
  }, [takeOverBoard]);

  const openFirstBoard = useCallback(async () => {
    const board = createBoard("My first draft");
    await repository.create(board); rememberStored(board); localStorage.setItem(LAST_BOARD, board.id);
    useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
    await claim(board.id); await startCoordinator();
    usePersistenceStore.getState().markSaved(0, new Date().toISOString());
  }, [claim, rememberStored, repository, startCoordinator]);

  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const persistence = usePersistenceStore.getState();
    persistence.markLoading(); persistence.setNetworkOnline(navigator.onLine);
    void (async () => {
      try {
        const id = localStorage.getItem(LAST_BOARD);
        if (!id) { await openFirstBoard(); return; }
        const loadStartedAt = performanceNow();
        // The claim runs alongside the read so a lone tab waits on neither.
        const [lease, raw] = await Promise.all([claim(id), repository.getRawById(id)]);
        const result = loadBoardDocument(id, raw);
        if (result.kind === "missing") { await openFirstBoard(); return; }
        if (result.kind === "invalid") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: result.issues }); return;
        }
        if (result.kind === "unsupported-version") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "unsupported-version", issues: ["This board was created by a newer Draftspace schema."], schemaVersion: result.schemaVersion }); return;
        }
        useBoardStore.getState().setBoard(result.board); rememberStored(result.board);
        useViewportStore.getState().setViewport(result.board.preferences.restoreViewport ? result.board.viewport : { x: 0, y: 0, zoom: 1 });
        recordPerformanceSample({ name: "board-load", durationMs: performanceNow() - loadStartedAt, elementCount: result.board.elementIds.length });
        // A tab that does not own the board writes nothing at all, not even the migration.
        if (!lease.isOwner) { persistence.markSaved(0, new Date().toISOString()); return; }
        if (result.migrated) await repository.update(result.board);
        await startCoordinator(); persistence.markSaved(0, new Date().toISOString());
      } catch (error) { console.error("Draftspace could not initialize local persistence", error); enterSessionOnly(error); }
    })();
  }, [claim, enterSessionOnly, openFirstBoard, rememberStored, repository, startCoordinator]);

  useEffect(() => () => coordinator.current?.dispose(), []);

  // Read the list once a board is open rather than on the path that blocks first paint. This
  // covers every way the open board changes: first load, recovery, storage retry, and switching.
  useEffect(() => { if (openBoardId) void refreshBoards(); }, [openBoardId, refreshBoards]);

  useEffect(() => {
    if (!initialized.current || revision === 0) return;
    coordinator.current?.schedule(revision);
  }, [revision]);

  useEffect(() => {
    const unsubscribe = useViewportStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return;
      if (viewportTimer.current !== null) clearTimeout(viewportTimer.current);
      viewportTimer.current = setTimeout(flushViewport, 350);
    });
    return () => { if (viewportTimer.current !== null) clearTimeout(viewportTimer.current); unsubscribe(); };
  }, [flushViewport]);

  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden") { flushViewport(); void coordinator.current?.flush("visibility"); return; }
      // Another tab may have added a board while this one sat in the background.
      void refreshBoards();
    };
    const pagehide = () => { flushViewport(); void coordinator.current?.flush("pagehide"); };
    const online = () => usePersistenceStore.getState().setNetworkOnline(true);
    const offline = () => usePersistenceStore.getState().setNetworkOnline(false);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [flushViewport, refreshBoards]);

  const retrySave = useCallback(async () => { await coordinator.current?.retry(); }, []);

  /**
   * Saves the draft as a board of its own, for when the stored record has moved on since this
   * tab last agreed with it. The original belongs to whichever tab advanced it, and this tab's
   * copy is unsaved work, so neither one may be written over the other.
   *
   * The copy becomes the last-opened board, so the work the user was just doing is what the
   * next cold start puts on screen. Since the board switcher landed, that choice no longer
   * strands anything: both boards are listed and either one opens, so the only thing at stake
   * is which of the two comes up first. The original is intact and its owning tab keeps
   * saving to it.
   */
  const saveAsRecoveredCopy = useCallback(async (board: BoardDocument) => {
    const timestamp = now();
    const copy: BoardDocument = { ...board, id: newId(), name: `${board.name} (recovered copy)`, createdAt: timestamp, updatedAt: timestamp };
    // Access is `pending` for the length of this claim, so nothing can be drawn across it.
    await claim(copy.id);
    // The copy goes on screen before it is written, not after. The claim makes this tab editable
    // again while the write is still in flight, and a shape drawn there would otherwise be
    // committed to the document being replaced and then thrown away by a later setBoard, with the
    // status reporting it saved. Swapping first leaves it on the copy, where the revision this
    // write stands at is read and the tail below has something to schedule.
    useBoardStore.getState().setBoard(copy); rememberStored(copy);
    const savedRevision = useBoardStore.getState().revision;
    await repository.create(copy);
    // Only once the copy exists may it be what this browser opens next: a pointer to a board that
    // was never written would send the next cold start to a board that is not there.
    localStorage.setItem(LAST_BOARD, copy.id);
    const activeCoordinator = await startCoordinator(savedRevision);
    const persistence = usePersistenceStore.getState();
    persistence.markSaved(savedRevision, new Date().toISOString());
    // A notice, not an error: the next autosave clears `error`, and a pan is enough to trigger one.
    persistence.setNotice(persistenceError("board-saved-as-copy", `Saved as "${copy.name}".`, false));
    const latestRevision = useBoardStore.getState().revision;
    if (latestRevision > savedRevision) activeCoordinator.schedule(latestRevision);
  }, [claim, rememberStored, repository, startCoordinator]);

  const retryStorage = useCallback(async () => {
    try {
      await drainCoordinator();
      const retrying = useBoardStore.getState().board; if (!retrying) return;
      // Storage is back, but another tab may have claimed this board meanwhile. A tab that saves
      // nothing cannot overwrite that tab, so it keeps its draft and stays editable instead of
      // taking the lease: freezing it read-only would strand the work and a later promotion
      // would replace it with the stored document. The backup download is still there.
      const lease = await claimBoard({ boardId: retrying.id });
      if (!lease.isOwner) { enterSessionOnly(persistenceError("board-claimed-elsewhere", "Another tab claimed this board while storage was unavailable.", true)); return; }
      usePersistenceStore.getState().setBoardAccess("owner");
      const existing = await repository.getRawById(retrying.id);
      // A session-only tab stays editable throughout, so every await above is a window the user
      // can draw in. Take the document and the revision it stands at together, after the last of
      // them: writing the copy captured before the awaits while reporting the newer revision
      // saved would drop the edit in between with the UI saying it had been stored.
      const board = useBoardStore.getState().board;
      // The board id alone cannot say the claim taken above is still this tab's, because a switch
      // away and back reuses it, and a retry that wrote while another tab held the board would be
      // exactly the overwrite the lease exists to stop.
      if (!board || !stillHolds(lease, retrying.id)) return;
      const savedRevision = useBoardStore.getState().revision;
      // Holding the claim makes a write exclusive, not current. takeOverBoard closes that gap by
      // reloading the stored document before it allows editing; this path cannot reload, because
      // the draft on screen is unsaved work, so it checks instead of assuming.
      if (storedRecordMovedOn(existing, board.id, storedStamp.current)) { await saveAsRecoveredCopy(board); return; }
      usePersistenceStore.getState().markSaving(savedRevision);
      if (existing === null) await repository.create(board); else await repository.update(board);
      rememberStored(board);
      // This path writes the board itself and never calls setBoard, so the store's revision stays
      // where it was. A coordinator started at 0 would read that persisted revision as unsaved and
      // make the next switch redo the write - and refuse the switch if the redundant write failed.
      localStorage.setItem(LAST_BOARD, board.id); const activeCoordinator = await startCoordinator(savedRevision);
      usePersistenceStore.getState().markSaved(savedRevision, new Date().toISOString());
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > savedRevision) activeCoordinator.schedule(latestRevision);
    } catch (error) { enterSessionOnly(normalizePersistenceError(error, "write")); }
  }, [drainCoordinator, enterSessionOnly, rememberStored, repository, saveAsRecoveredCopy, startCoordinator]);

  const startNewBoard = useCallback(async () => {
    await drainCoordinator();
    const board = createBoard("My first draft");
    // markSaved deliberately preserves a notice, so without this the "saved as a copy" panel
    // would go on naming a board that is no longer open. The takeover flag is cleared by the
    // pending access this board's claim passes through.
    usePersistenceStore.getState().setNotice(null);
    useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
    const savedRevision = useBoardStore.getState().revision;
    usePersistenceStore.getState().markSaving(savedRevision);
    try {
      // A fresh board has a fresh id, so this tab always owns it, even if it was read-only before.
      await claim(board.id);
      await repository.create(board); rememberStored(board); localStorage.setItem(LAST_BOARD, board.id); const activeCoordinator = await startCoordinator();
      usePersistenceStore.getState().markSaved(savedRevision, new Date().toISOString());
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > savedRevision) activeCoordinator.schedule(latestRevision);
      usePersistenceStore.getState().clearRecovery();
    }
    catch (error) { enterSessionOnly(normalizePersistenceError(error, "write")); }
  }, [claim, drainCoordinator, enterSessionOnly, rememberStored, repository, startCoordinator]);

  /**
   * Opens another stored board in place. The board being left is settled first: whatever is still
   * inside the autosave debounce, or still waiting out a retry, belongs to it, and once its
   * coordinator is drained nothing else will ever write it. Work storage will not take holds the
   * switch back rather than being discarded behind a menu that reported success.
   */
  const openBoard = useCallback(async (boardId: string): Promise<OpenBoardOutcome> => {
    if (useBoardStore.getState().board?.id === boardId) return "opened";
    const persistence = usePersistenceStore.getState();
    let handedOver = false;
    try {
      // Read the target before letting go of the open board. The list only offers boards that
      // parsed, so an unreadable one here means another tab changed it; leaving the open board
      // untouched beats stranding it on a recovery screen it did not cause. The list keeps the
      // row so the menu can say so, rather than dropping it and closing over a click that did
      // nothing; the next refresh picks the removal up.
      const result = loadBoardDocument(boardId, await repository.getRawById(boardId));
      if (result.kind !== "ready") return "unreadable";
      flushViewport();
      if (!(await settleOpenBoard())) return "unsaved-work";
      persistence.markLoading();
      await drainCoordinator();
      // The board on screen and the claim change together. Claiming releases the outgoing board's
      // lock, so the tab that was reading this one is free to take it the moment this tab leaves.
      // From here the outgoing claim is being released, so nothing after this can report that
      // the picked board was the thing that failed.
      handedOver = true;
      const lease = await claim(result.board.id);
      useBoardStore.getState().setBoard(result.board);
      // Selection, history and any in-flight style preview belong to the board that was open, not
      // to this one. Previews are keyed by element id, and two boards can hold the same ids - a
      // recovered copy is exactly that - so a preview left behind would repaint the new board and
      // finishPreview would commit the old board's patch against it.
      useSessionStore.getState().setSelected([]);
      useSessionStore.getState().setStylePreview(null);
      useSessionStore.getState().setConnectorStylePreview(null);
      useViewportStore.getState().setViewport(result.board.preferences.restoreViewport ? result.board.viewport : { x: 0, y: 0, zoom: 1 });
      localStorage.setItem(LAST_BOARD, result.board.id);
      // Another tab already holds this board, so this one writes nothing at all, not even the
      // migration, and starts no coordinator. The switcher is how a read-only tab reaches a board
      // it can edit, so it must not become a way to open a second writer on the same one.
      if (!lease.isOwner) { persistence.markSaved(0, new Date().toISOString()); return "opened"; }
      rememberStored(result.board);
      if (result.migrated) await repository.update(result.board);
      const activeCoordinator = await startCoordinator();
      persistence.markSaved(0, new Date().toISOString());
      // An edit made while the swap was still awaiting storage has no coordinator to schedule it.
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > 0) activeCoordinator.schedule(latestRevision);
      return "opened";
    } catch (error) {
      console.error("Draftspace could not open that board", error);
      // Before the claim is handed over the open board and its autosave are untouched, so reading
      // the picked one is the only thing that failed and the row already reports that. Once the
      // handover starts, this tab has let its lease go and drained its coordinator, so a throw is
      // evidence about storage this session depends on rather than about the board picked, and
      // the session-only status is what has something left to say. Leaving that path to the
      // "unreadable" return would strand the tab pending: no banner, and no edits ever again.
      const reachedScreen = useBoardStore.getState().board?.id === boardId;
      if (!handedOver && !reachedScreen) return "unreadable";
      // Everything that can still throw here is a write - the last-opened key, the migration
      // write-back, starting the coordinator - so a full-storage failure must say so rather than
      // report that the board could not be read.
      enterSessionOnly(normalizePersistenceError(error, "write"));
      // A throw from the claim itself leaves the pick short of the screen: the user is still
      // looking at the board they had, under the name they had, so reporting "opened" would close
      // the menu over a click that looks ignored while that board has quietly stopped being saved.
      // Neither half is guessable, and only a non-opened outcome keeps the menu up to say both.
      return reachedScreen ? "opened" : "handover-failed";
    }
  }, [claim, drainCoordinator, enterSessionOnly, flushViewport, rememberStored, repository, settleOpenBoard, startCoordinator]);

  const downloadRecovery = useCallback(async () => {
    const recovery = usePersistenceStore.getState().recovery; if (!recovery) return;
    finishBackup(serializeRecoveryBackup(recovery));
  }, []);

  const downloadCurrentBackup = useCallback(async () => {
    const board = useBoardStore.getState().board; if (!board) return;
    finishBackup(serializeBoardBackup(board));
  }, []);

  return { retrySave, retryStorage, startNewBoard, openBoard, downloadRecovery, downloadCurrentBackup };
}
