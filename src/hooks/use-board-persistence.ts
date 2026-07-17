"use client";

import { useEffect, useRef } from "react";
import { createBoard, useBoardStore } from "@/stores/board-store";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { useViewportStore } from "@/stores/viewport-store";

const LAST_BOARD = "draftspace:last-board";

export function useBoardPersistence() {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const repo = new IndexedDbBoardRepository();
    void (async () => {
      try {
        const id = localStorage.getItem(LAST_BOARD);
        const restored = id ? await repo.getById(id) : null;
        const board = restored ?? createBoard("My first draft");
        localStorage.setItem(LAST_BOARD, board.id);
        useBoardStore.getState().setBoard(board);
        useViewportStore.getState().setViewport(board.preferences.restoreViewport ? board.viewport : { x: 0, y: 0, zoom: 1 });
        if (!restored) await repo.create(board);
      } catch (error) {
        console.error("Draftspace could not restore the local board", error);
        useBoardStore.getState().setBoard(createBoard("Recovered draft"));
        useBoardStore.getState().setSaveStatus("failed");
      }
    })();
  }, []);

  const revision = useBoardStore((s) => s.revision);
  useEffect(() => {
    if (!initialized.current || revision === 0) return;
    const timeout = window.setTimeout(async () => {
      const state = useBoardStore.getState(); if (!state.board) return;
      state.setSaveStatus(navigator.onLine ? "saving" : "offline");
      try {
        await new IndexedDbBoardRepository().update(state.board);
        state.setSaveStatus(navigator.onLine ? "saved" : "offline");
      } catch (error) {
        console.error("Draftspace could not save the board", error); state.setSaveStatus("failed");
      }
    }, 500);
    return () => window.clearTimeout(timeout);
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
}
