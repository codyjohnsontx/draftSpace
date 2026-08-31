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
import { normalizePersistenceError } from "@/features/persistence/persistence-errors";
import { performanceNow, recordPerformanceSample } from "@/features/performance/performance-monitor";

const LAST_BOARD = "draftspace:last-board";

const finishBackup = (result: BackupResult) => {
  if (!result.ok) { usePersistenceStore.getState().setError(result.error); return; }
  const download = downloadBackup(result);
  if (!download.ok) usePersistenceStore.getState().setError(download.error);
};

/**
 * Whether a picked board is now the open one, and when it is not, which board stood in the way:
 * the picked one could not be read, or the open one still holds work storage would not take.
 */
export type OpenBoardOutcome = "opened" | "unreadable" | "unsaved-work";

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
    const outgoing = coordinator.current;
    if (!outgoing || usePersistenceStore.getState().status === "session-only") return false;
    return outgoing.settle();
  }, []);

  const startCoordinator = useCallback(async () => {
    await drainCoordinator();
    const nextCoordinator = new AutosaveCoordinator({
      repository,
      getBoard: () => useBoardStore.getState().board,
      getRevision: () => useBoardStore.getState().revision,
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

  /** A board that is already open is left exactly as it is: `setBoard` would drop its history. */
  const enterSessionOnly = useCallback((error: unknown) => {
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

  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const persistence = usePersistenceStore.getState();
    persistence.markLoading(); persistence.setNetworkOnline(navigator.onLine);
    void (async () => {
      try {
        const id = localStorage.getItem(LAST_BOARD);
        if (!id) {
          const board = createBoard("My first draft");
          await repository.create(board); localStorage.setItem(LAST_BOARD, board.id);
          useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
          await startCoordinator(); persistence.markSaved(0, new Date().toISOString()); return;
        }
        const loadStartedAt = performanceNow();
        const result = loadBoardDocument(id, await repository.getRawById(id));
        if (result.kind === "missing") {
          const board = createBoard("My first draft");
          await repository.create(board); localStorage.setItem(LAST_BOARD, board.id);
          useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
          await startCoordinator(); persistence.markSaved(0, new Date().toISOString()); return;
        }
        if (result.kind === "invalid") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: result.issues }); return;
        }
        if (result.kind === "unsupported-version") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "unsupported-version", issues: ["This board was created by a newer Draftspace schema."], schemaVersion: result.schemaVersion }); return;
        }
        useBoardStore.getState().setBoard(result.board);
        useViewportStore.getState().setViewport(result.board.preferences.restoreViewport ? result.board.viewport : { x: 0, y: 0, zoom: 1 });
        recordPerformanceSample({ name: "board-load", durationMs: performanceNow() - loadStartedAt, elementCount: result.board.elementIds.length });
        if (result.migrated) await repository.update(result.board);
        await startCoordinator(); persistence.markSaved(0, new Date().toISOString());
      } catch (error) { console.error("Draftspace could not initialize local persistence", error); enterSessionOnly(error); }
    })();
  }, [enterSessionOnly, repository, startCoordinator]);

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

  const retryStorage = useCallback(async () => {
    try {
      await drainCoordinator();
      const board = useBoardStore.getState().board; if (!board) return;
      const savedRevision = useBoardStore.getState().revision;
      usePersistenceStore.getState().markSaving(savedRevision);
      const existing = await repository.getRawById(board.id);
      if (existing === null) await repository.create(board); else await repository.update(board);
      localStorage.setItem(LAST_BOARD, board.id); const activeCoordinator = await startCoordinator();
      usePersistenceStore.getState().markSaved(savedRevision, new Date().toISOString());
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > savedRevision) activeCoordinator.schedule(latestRevision);
    } catch (error) { usePersistenceStore.getState().enterSessionOnly(normalizePersistenceError(error, "write")); }
  }, [drainCoordinator, repository, startCoordinator]);

  const startNewBoard = useCallback(async () => {
    await drainCoordinator();
    const board = createBoard("My first draft");
    useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
    const savedRevision = useBoardStore.getState().revision;
    usePersistenceStore.getState().markSaving(savedRevision);
    try {
      await repository.create(board); localStorage.setItem(LAST_BOARD, board.id); const activeCoordinator = await startCoordinator();
      usePersistenceStore.getState().markSaved(savedRevision, new Date().toISOString());
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > savedRevision) activeCoordinator.schedule(latestRevision);
      usePersistenceStore.getState().clearRecovery();
    }
    catch (error) { enterSessionOnly(normalizePersistenceError(error, "write")); }
  }, [drainCoordinator, enterSessionOnly, repository, startCoordinator]);

  /**
   * Opens another stored board in place. The board being left is settled first: whatever is still
   * inside the autosave debounce, or still waiting out a retry, belongs to it, and once its
   * coordinator is drained nothing else will ever write it. Work storage will not take holds the
   * switch back rather than being discarded behind a menu that reported success.
   */
  const openBoard = useCallback(async (boardId: string): Promise<OpenBoardOutcome> => {
    if (useBoardStore.getState().board?.id === boardId) return "opened";
    const persistence = usePersistenceStore.getState();
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
      useBoardStore.getState().setBoard(result.board);
      // Selection and history belong to the board that was open, not to this one.
      useSessionStore.getState().setSelected([]);
      useViewportStore.getState().setViewport(result.board.preferences.restoreViewport ? result.board.viewport : { x: 0, y: 0, zoom: 1 });
      localStorage.setItem(LAST_BOARD, result.board.id);
      if (result.migrated) await repository.update(result.board);
      const activeCoordinator = await startCoordinator();
      persistence.markSaved(0, new Date().toISOString());
      // An edit made while the swap was still awaiting storage has no coordinator to schedule it.
      const latestRevision = useBoardStore.getState().revision;
      if (latestRevision > 0) activeCoordinator.schedule(latestRevision);
      return "opened";
    } catch (error) {
      console.error("Draftspace could not open that board", error);
      // Only a throw once the swap has happened is evidence about storage this session depends on:
      // the picked board is on screen with its predecessor's coordinator already drained, so the
      // row must not also claim it could not be opened and the session-only status is what has
      // something left to say. Before the swap the open board and its autosave are untouched, so
      // reading the picked one is the only thing that failed, and the row already reports that.
      if (useBoardStore.getState().board?.id !== boardId) return "unreadable";
      enterSessionOnly(error);
      return "opened";
    }
  }, [drainCoordinator, enterSessionOnly, flushViewport, repository, settleOpenBoard, startCoordinator]);

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
