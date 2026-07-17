"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBoard, useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useViewportStore } from "@/stores/viewport-store";
import { AutosaveCoordinator, type AutosaveEvent } from "@/features/persistence/autosave-coordinator";
import { loadBoardDocument } from "@/features/persistence/load-board-document";
import { downloadBackup, serializeBoardBackup, serializeRecoveryBackup } from "@/features/persistence/backup";
import { normalizePersistenceError } from "@/features/persistence/persistence-errors";

const LAST_BOARD = "draftspace:last-board";

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
  const initialized = useRef(false);
  const revision = useBoardStore((state) => state.revision);

  const handleAutosaveEvent = useCallback((event: AutosaveEvent) => {
    const state = usePersistenceStore.getState();
    if (event.type === "saving") state.markSaving(event.revision);
    else if (event.type === "saved") state.markSaved(event.revision, event.savedAt);
    else state.markFailed(event.error);
  }, []);

  const startCoordinator = useCallback(() => {
    coordinator.current?.dispose();
    coordinator.current = new AutosaveCoordinator({
      repository,
      getBoard: () => useBoardStore.getState().board,
      getRevision: () => useBoardStore.getState().revision,
      onStateChange: handleAutosaveEvent,
    });
  }, [handleAutosaveEvent, repository]);

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
          startCoordinator(); persistence.markSaved(0, new Date().toISOString()); return;
        }
        const result = loadBoardDocument(id, await repository.getRawById(id));
        if (result.kind === "missing") {
          const board = createBoard("My first draft");
          await repository.create(board); localStorage.setItem(LAST_BOARD, board.id);
          useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
          startCoordinator(); persistence.markSaved(0, new Date().toISOString()); return;
        }
        if (result.kind === "invalid") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: result.issues }); return;
        }
        if (result.kind === "unsupported-version") {
          persistence.requireRecovery({ boardId: result.boardId, raw: result.raw, detectedAt: new Date().toISOString(), reason: "unsupported-version", issues: ["This board was created by a newer Draftspace schema."], schemaVersion: result.schemaVersion }); return;
        }
        useBoardStore.getState().setBoard(result.board);
        useViewportStore.getState().setViewport(result.board.preferences.restoreViewport ? result.board.viewport : { x: 0, y: 0, zoom: 1 });
        startCoordinator(); persistence.markSaved(0, new Date().toISOString());
      } catch (error) { console.error("Draftspace could not initialize local persistence", error); enterSessionOnly(error); }
    })();
  }, [enterSessionOnly, repository, startCoordinator]);

  useEffect(() => () => coordinator.current?.dispose(), []);

  useEffect(() => {
    if (!initialized.current || revision === 0) return;
    coordinator.current?.schedule(revision);
  }, [revision]);

  useEffect(() => {
    let timeout = 0;
    const unsubscribe = useViewportStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return;
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => useBoardStore.getState().persistViewport(useViewportStore.getState().viewport), 350);
    });
    return () => { window.clearTimeout(timeout); unsubscribe(); };
  }, []);

  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") void coordinator.current?.flush("visibility"); };
    const pagehide = () => { void coordinator.current?.flush("pagehide"); };
    const online = () => usePersistenceStore.getState().setNetworkOnline(true);
    const offline = () => usePersistenceStore.getState().setNetworkOnline(false);
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pagehide);
    window.addEventListener("online", online); window.addEventListener("offline", offline);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pagehide); window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const retrySave = useCallback(async () => { await coordinator.current?.retry(); }, []);

  const retryStorage = useCallback(async () => {
    const board = useBoardStore.getState().board; if (!board) return;
    try {
      usePersistenceStore.getState().markSaving(useBoardStore.getState().revision);
      const existing = await repository.getRawById(board.id);
      if (existing === null) await repository.create(board); else await repository.update(board);
      localStorage.setItem(LAST_BOARD, board.id); startCoordinator();
      usePersistenceStore.getState().markSaved(useBoardStore.getState().revision, new Date().toISOString());
    } catch (error) { usePersistenceStore.getState().enterSessionOnly(normalizePersistenceError(error, "write")); }
  }, [repository, startCoordinator]);

  const startNewBoard = useCallback(async () => {
    const board = createBoard("My first draft");
    useBoardStore.getState().setBoard(board); useViewportStore.getState().setViewport(board.viewport);
    usePersistenceStore.getState().clearRecovery(); usePersistenceStore.getState().markSaving(0); localStorage.setItem(LAST_BOARD, board.id);
    try { await repository.create(board); startCoordinator(); usePersistenceStore.getState().markSaved(0, new Date().toISOString()); }
    catch (error) { enterSessionOnly(error); }
  }, [enterSessionOnly, repository, startCoordinator]);

  const downloadRecovery = useCallback(async () => {
    const recovery = usePersistenceStore.getState().recovery; if (!recovery) return;
    const result = serializeRecoveryBackup(recovery);
    if (result.ok) downloadBackup(result); else usePersistenceStore.getState().setError(result.error);
  }, []);

  const downloadCurrentBackup = useCallback(async () => {
    const board = useBoardStore.getState().board; if (!board) return;
    const result = serializeBoardBackup(board);
    if (result.ok) downloadBackup(result);
    else usePersistenceStore.getState().setError(result.error);
  }, []);

  return { retrySave, retryStorage, startNewBoard, downloadRecovery, downloadCurrentBackup };
}
