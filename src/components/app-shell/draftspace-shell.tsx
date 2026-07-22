"use client";

import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import { TopBar } from "./top-bar";
import { useBoardPersistence } from "@/hooks/use-board-persistence";
import { useEffect, useState } from "react";
import { usePersistenceStore } from "@/stores/persistence-store";
import { BoardRecoveryScreen } from "@/components/recovery/board-recovery-screen";
import { detectBrowserCapabilities, type BrowserCapabilities } from "@/lib/browser/capabilities";
import { UnsupportedBrowserScreen } from "@/components/unsupported-browser/unsupported-browser-screen";
import { useBoardStore } from "@/stores/board-store";
import { initializePerformanceMonitor } from "@/features/performance/performance-monitor";
import { useUiPreferencesStore } from "@/stores/ui-preferences-store";
import { StyleInspector } from "@/components/inspector/style-inspector";

export function DraftspaceShell() {
  useState(() => initializePerformanceMonitor());
  const persistence = useBoardPersistence();
  const status = usePersistenceStore((state) => state.status); const recovery = usePersistenceStore((state) => state.recovery);
  const board = useBoardStore((state) => state.board);
  const inspectorMode = useUiPreferencesStore((state) => state.inspector.mode);
  const hydrateUiPreferences = useUiPreferencesStore((state) => state.hydrate);
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  useEffect(() => {
    hydrateUiPreferences();
    const report = detectBrowserCapabilities();
    let active = true;
    queueMicrotask(() => { if (active) setCapabilities(report); });
    if (report.serviceWorker && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js").catch((error) => console.debug("Draftspace service worker registration failed", error));
    }
    return () => { active = false; };
  }, [hydrateUiPreferences]);
  if (status === "recovery-required" && recovery) return <BoardRecoveryScreen recovery={recovery} controller={persistence} />;
  if (capabilities && !capabilities.canvas2d) return <UnsupportedBrowserScreen canDownloadBackup={Boolean(board)} onDownloadBackup={persistence.downloadCurrentBackup} />;
  if (!capabilities) return <div className="loading-canvas"><span /><p>Checking canvas support…</p></div>;
  return <div className="draftspace-shell" data-inspector-mode={inspectorMode}><CanvasWorkspace /><StyleInspector /><TopBar persistence={persistence} /></div>;
}
