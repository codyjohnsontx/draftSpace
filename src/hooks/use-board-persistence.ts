"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBoard, useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useViewportStore } from "@/stores/viewport-store";
import { AutosaveCoordinator, type AutosaveEvent } from "@/features/persistence/autosave-coordinator";
import { loadBoardDocument } from "@/features/persistence/load-board-document";
import { downloadBackup, serializeBoardBackup, serializeRecoveryBackup, type BackupResult } from "@/features/persistence/backup";
import { normalizePersistenceError } from "@/features/persistence/persistence-errors";

const LAST_BOARD = "draftspace:last-board";

const finishBackup = (result: BackupResult) => {
  if (!result.ok) { usePersistenceStore.getState().setError(result.error); return; }
  const download = downloadBackup(result);
  if (!download.ok) usePersistenceStore.getState().setError(download.error);
};

export type PersistenceController = {
  retrySave: () => Promise<void>;
  retryStorage: () => Promise<void>;
  startNewBoard: () => Promise<void>;
  downloadRecovery: () => Promise<void>;
  downloadCurrentBackup: () => Promise<void>;
};

export function useBoardPersistence(): PersistenceController {
  const [repository] = useState(() => new IndexedDbBoardRepository());
  const coordinator = useRef<AutosaveCoordinator | null>(null);
  const viewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const revision = useBoardStore((state) => state.revision);

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

  const enterSessionOnly = useCallback((error: unknown) => {
    const board = useBoardStore.getState().board ?? createBoard("Temporary draft");
    useBoardStore.getState().setBoard(board);
    useViewportStore.getState().setViewport(board.viewport);
    usePersistenceStore.getState().enterSessionOnly(normalizePersistenceError(error, "read"));
  }, []);

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
        await startCoordinator(); persistence.markSaved(0, new Date().toISOString());
      } catch (error) { console.error("Draftspace could not initialize local persistence", error); enterSessionOnly(error); }
    })();
  }, [enterSessionOnly, repository, startCoordinator]);

  useEffect(() => () => coordinator.current?.dispose(), []);

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
    const visibility = () => { if (document.visibilityState === "hidden") { flushViewport(); void coordinator.current?.flush("visibility"); } };
    const pagehide = () => { flushViewport(); void coordinator.current?.flush("pagehide"); };
    const online = () => usePersistenceStore.getState().setNetworkOnline(true);
    const offline = () => usePersistenceStore.getState().setNetworkOnline(false);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [flushViewport]);

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

  const downloadRecovery = useCallback(async () => {
    const recovery = usePersistenceStore.getState().recovery; if (!recovery) return;
    finishBackup(serializeRecoveryBackup(recovery));
  }, []);

  const downloadCurrentBackup = useCallback(async () => {
    const board = useBoardStore.getState().board; if (!board) return;
    finishBackup(serializeBoardBackup(board));
  }, []);

  return { retrySave, retryStorage, startNewBoard, downloadRecovery, downloadCurrentBackup };
}
