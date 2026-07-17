"use client";

import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import { TopBar } from "./top-bar";
import { useBoardPersistence } from "@/hooks/use-board-persistence";
import { useEffect } from "react";
import { usePersistenceStore } from "@/stores/persistence-store";
import { BoardRecoveryScreen } from "@/components/recovery/board-recovery-screen";

export function DraftspaceShell() {
  const persistence = useBoardPersistence();
  const status = usePersistenceStore((state) => state.status); const recovery = usePersistenceStore((state) => state.recovery);
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js"); }, []);
  if (status === "recovery-required" && recovery) return <BoardRecoveryScreen recovery={recovery} controller={persistence} />;
  return <div className="draftspace-shell"><CanvasWorkspace /><TopBar persistence={persistence} /></div>;
}
