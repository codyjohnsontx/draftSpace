"use client";

import { useEffect, useRef } from "react";
import { Download, FileWarning, Plus } from "lucide-react";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import type { RecoveryPayload } from "@/stores/persistence-store";
import { usePersistenceStore } from "@/stores/persistence-store";

export function BoardRecoveryScreen({ recovery, controller }: { recovery: RecoveryPayload; controller: PersistenceController }) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const error = usePersistenceStore((state) => state.error);
  useEffect(() => primaryRef.current?.focus(), []);
  const unsupported = recovery.reason === "unsupported-version";
  return <main className="recovery-screen" aria-labelledby="recovery-title">
    <div className="recovery-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <section className="recovery-content">
      <span className="recovery-icon" aria-hidden="true"><FileWarning size={24} /></span>
      <p className="eyebrow">Local board recovery</p>
      <h1 id="recovery-title">We couldn’t open this board</h1>
      <p className="recovery-lede">The original local record has not been changed.</p>
      <div className="recovery-reason">
        <strong>{unsupported ? "Unsupported newer version" : "Invalid board data"}</strong>
        <p>{unsupported ? `This board uses schema version ${recovery.schemaVersion ?? "unknown"}, which this version of Draftspace cannot open safely.` : "Some stored board fields could not be validated."}</p>
        {recovery.issues.length > 0 && <ul>{recovery.issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </div>
      <div className="recovery-actions">
        <button ref={primaryRef} className="recovery-primary" onClick={() => void controller.downloadRecovery()}><Download size={17} />Download raw data</button>
        <button className="recovery-secondary" onClick={() => void controller.startNewBoard()}><Plus size={17} />Start a new board</button>
      </div>
      <p className="recovery-note">Starting a new board will not delete the damaged local record.</p>
      {error && <p className="recovery-download-error" role="alert">{error.message}</p>}
    </section>
  </main>;
}
