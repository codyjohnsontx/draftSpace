"use client";

import { Download, Layers3 } from "lucide-react";

export function UnsupportedBrowserScreen({ canDownloadBackup, onDownloadBackup }: { canDownloadBackup: boolean; onDownloadBackup: () => Promise<void> }) {
  return <main className="unsupported-browser-screen" aria-labelledby="unsupported-browser-heading">
    <div className="recovery-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <section className="unsupported-browser-content">
      <div className="recovery-icon" aria-hidden="true"><Layers3 size={23} /></div>
      <p className="eyebrow">Browser support</p>
      <h1 id="unsupported-browser-heading">This browser can’t open the canvas</h1>
      <p className="recovery-lede">Draftspace requires Canvas 2D. Open this board in a current version of Chrome, Firefox, Safari, or Edge.</p>
      <p className="unsupported-browser-note">Your board has not been modified.</p>
      {canDownloadBackup && <div className="recovery-actions"><button className="recovery-secondary" type="button" onClick={() => void onDownloadBackup()}><Download size={16} />Download emergency backup</button></div>}
    </section>
  </main>;
}
