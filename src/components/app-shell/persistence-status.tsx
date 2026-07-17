"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, Cloudy, HardDriveDownload, RefreshCw } from "lucide-react";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

export function PersistenceStatus({ controller }: { controller: PersistenceController }) {
  const status = usePersistenceStore((state) => state.status);
  const error = usePersistenceStore((state) => state.error);
  const online = usePersistenceStore((state) => state.networkOnline);
  const [open, setOpen] = useState(false); const buttonRef = useRef<HTMLButtonElement>(null);
  const actionable = status === "failed" || status === "session-only";
  const label = status === "loading" ? "Opening…" : status === "saving" ? "Saving…" : status === "failed" ? "Save failed" : status === "session-only" ? "Not saving" : online ? "Saved locally" : "Saved offline";

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [open]);

  const icon = status === "failed" ? <CloudOff size={14} /> : status === "session-only" ? <HardDriveDownload size={14} /> : <Cloudy size={14} />;
  if (!actionable) return <span className={`save-status ${status}`} title={label}>{icon}<span>{label}</span></span>;

  return <div className="persistence-status-wrap">
    <button ref={buttonRef} className={`save-status save-status-button ${status}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>{icon}<span>{label}</span></button>
    {open && <div className="persistence-panel" role="dialog" aria-label={status === "failed" ? "Save problem" : "Local storage unavailable"}>
      <strong>{status === "failed" ? "Your work is still open" : "This draft is temporary"}</strong>
      <p>{status === "failed" ? "Your latest changes are still in this tab." : "Local storage is unavailable. Closing this tab may lose your work."}</p>
      {error?.message && <small>{error.message}</small>}
      <div className="persistence-actions">
        <button className="compact-primary" onClick={() => { setOpen(false); void (status === "failed" ? controller.retrySave() : controller.retryStorage()); }}><RefreshCw size={14} />{status === "failed" ? "Retry save" : "Retry storage"}</button>
        <button className="compact-secondary" onClick={() => void controller.downloadCurrentBackup()}><HardDriveDownload size={14} />Download backup</button>
      </div>
    </div>}
  </div>;
}
