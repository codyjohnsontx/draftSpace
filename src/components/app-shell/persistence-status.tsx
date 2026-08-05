"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, Cloudy, Eye, HardDriveDownload, RefreshCw } from "lucide-react";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

export function PersistenceStatus({ controller }: { controller: PersistenceController }) {
  const status = usePersistenceStore((state) => state.status);
  const readOnly = usePersistenceStore((state) => state.boardAccess === "read-only");
  const error = usePersistenceStore((state) => state.error);
  const online = usePersistenceStore((state) => state.networkOnline);
  const [open, setOpen] = useState(false); const buttonRef = useRef<HTMLButtonElement>(null);
  // A read-only tab saves nothing, so its save state is not the thing to report.
  const actionable = readOnly || status === "failed" || status === "session-only";
  const label = readOnly ? "View only" : status === "loading" ? "Opening…" : status === "saving" ? "Saving…" : status === "failed" ? "Save failed" : status === "session-only" ? "Not saving" : online ? "Saved locally" : "Saved offline";

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [open]);

  const icon = readOnly ? <Eye size={14} /> : status === "failed" ? <CloudOff size={14} /> : status === "session-only" ? <HardDriveDownload size={14} /> : <Cloudy size={14} />;
  // Nothing is being saved either way, but the two reasons call for different advice.
  const sessionOnly = error?.code === "board-claimed-elsewhere"
    ? { dialog: "Another tab is editing this board", title: "This draft stays in this tab", detail: "Another tab is editing this board, so nothing here is saved. Closing this tab loses these changes." }
    : { dialog: "Local storage unavailable", title: "This draft is temporary", detail: "Local storage is unavailable. Closing this tab may lose your work." };
  if (!actionable) return <span className={`save-status ${status}`} title={label}>{icon}<span>{label}</span></span>;

  if (readOnly) return <div className="persistence-status-wrap">
    <button ref={buttonRef} className="save-status save-status-button read-only" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>{icon}<span>{label}</span></button>
    {open && <div className="persistence-panel" role="dialog" aria-label="Why this tab is read-only">
      <strong>Another tab is editing this board</strong>
      <p>Draftspace lets one tab at a time change a board, so two tabs cannot overwrite each other&apos;s work. This tab shows the board as it was when you opened it.</p>
      <p>Close the other tab and this one takes over on its own, with that tab&apos;s latest work.</p>
      <div className="persistence-actions">
        <button className="compact-secondary" onClick={() => void controller.downloadCurrentBackup()}><HardDriveDownload size={14} />Download backup</button>
      </div>
    </div>}
  </div>;

  return <div className="persistence-status-wrap">
    <button ref={buttonRef} className={`save-status save-status-button ${status}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>{icon}<span>{label}</span></button>
    {open && <div className="persistence-panel" role="dialog" aria-label={status === "failed" ? "Save problem" : sessionOnly.dialog}>
      <strong>{status === "failed" ? "Your work is still open" : sessionOnly.title}</strong>
      <p>{status === "failed" ? "Your latest changes are still in this tab." : sessionOnly.detail}</p>
      {error?.message && <small>{error.message}</small>}
      <div className="persistence-actions">
        <button className="compact-primary" onClick={() => { setOpen(false); void (status === "failed" ? controller.retrySave() : controller.retryStorage()); }}><RefreshCw size={14} />{status === "failed" ? "Retry save" : "Retry storage"}</button>
        <button className="compact-secondary" onClick={() => void controller.downloadCurrentBackup()}><HardDriveDownload size={14} />Download backup</button>
      </div>
    </div>}
  </div>;
}
