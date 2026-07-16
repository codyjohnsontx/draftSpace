"use client";

import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import { TopBar } from "./top-bar";
import { useBoardPersistence } from "@/hooks/use-board-persistence";
import { useEffect } from "react";

export function DraftspaceShell() {
  useBoardPersistence();
  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js"); }, []);
  return <div className="draftspace-shell"><CanvasWorkspace /><TopBar /></div>;
}
