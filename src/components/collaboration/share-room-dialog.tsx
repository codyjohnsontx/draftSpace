"use client";

import { Check, Copy, Eye, MousePointer2, Radio, UserMinus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { collaborationController } from "@/features/collaboration/collaboration-controller";
import { loadParticipantProfile, saveParticipantProfile } from "@/features/collaboration/participant-profile";
import { useCollaborationStore } from "@/stores/collaboration-store";

export function ShareRoomDialog({ onClose }: { onClose: () => void }) {
  const collaboration = useCollaborationStore();
  const existing = useMemo(() => loadParticipantProfile(), []);
  const [name, setName] = useState(existing?.displayName ?? "");
  const [copied, setCopied] = useState(false);
  const live = collaboration.mode === "host" && ["connecting", "connected"].includes(collaboration.status);
  const link = collaboration.code && typeof window !== "undefined" ? `${window.location.origin}/join/${collaboration.code}` : "";
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* The visible code remains available to copy manually. */ }
  };
  return <div className="collaboration-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-room-dialog" role="dialog" aria-modal="true" aria-labelledby="share-room-title">
      <header><div><span className="eyebrow">Live collaboration</span><h2 id="share-room-title">{live ? "Room is open" : "Share this board"}</h2></div><button type="button" className="icon-button" aria-label="Close share dialog" onClick={onClose}><X size={17} /></button></header>
      {!live && collaboration.status !== "creating" ? <>
        <p className="room-intro">Invite up to three people to point, edit, and work through the same board with you.</p>
        <label className="collaboration-field"><span>Your display name</span><input value={name} maxLength={40} autoFocus onChange={(event) => setName(event.currentTarget.value)} placeholder="How others will see you" /></label>
        {collaboration.error && <p className="collaboration-error" role="alert">{collaboration.error}</p>}
        <button type="button" className="room-primary" disabled={!name.trim()} onClick={() => { const profile = saveParticipantProfile(name); void collaborationController.startHost(profile); }}><Radio size={17} />Start live room</button>
        <small>Your board stays saved on this device. Draftspace only opens a temporary connection while the room is active.</small>
      </> : collaboration.status === "creating" || collaboration.status === "connecting" ? <div className="room-waiting"><span className="connection-pulse" /><strong>Opening the room…</strong><p>Your local board remains available while Draftspace connects.</p></div> : <>
        <div className="invite-code-block"><span>Invite code</span><strong>{collaboration.code}</strong><button type="button" onClick={() => void copy()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy invite link"}</button></div>
        {Object.values(collaboration.pending).map((participant) => <div className="join-request" key={participant.participantId}>
          <span className="participant-dot" style={{ background: participant.color }} /><div><strong>{participant.displayName}</strong><small>Wants to join</small></div>
          <button type="button" title="Admit as viewer" onClick={() => collaborationController.admit(participant.participantId, "viewer")}><Eye size={15} /></button>
          <button type="button" title="Admit as editor" className="request-editor" onClick={() => collaborationController.admit(participant.participantId, "editor")}><MousePointer2 size={15} /></button>
          <button type="button" title="Reject request" onClick={() => collaborationController.reject(participant.participantId)}><X size={15} /></button>
        </div>)}
        <div className="room-section-heading"><span>In this room</span><small>{Object.keys(collaboration.participants).length + 1}/4</small></div>
        <div className="participant-row self"><span className="participant-dot" style={{ background: collaboration.self?.color }} /><div><strong>{collaboration.self?.displayName}</strong><small>Host · this device</small></div></div>
        {Object.values(collaboration.participants).map((participant) => <div className="participant-row" key={participant.participantId}>
          <span className="participant-dot" style={{ background: participant.color }} /><div><strong>{participant.displayName}</strong><small>{participant.role === "editor" ? "Can edit" : "Viewing"}</small></div>
          <select aria-label={`Role for ${participant.displayName}`} value={participant.role} onChange={(event) => collaborationController.setRole(participant.participantId, event.currentTarget.value as "viewer" | "editor")}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
          <button type="button" className="remove-participant" aria-label={`Remove ${participant.displayName}`} onClick={() => collaborationController.kick(participant.participantId)}><UserMinus size={15} /></button>
        </div>)}
        <div className="room-footer-actions"><button type="button" className={collaboration.presenting ? "presenting" : ""} onClick={() => collaborationController.setPresenting(!collaboration.presenting)}><Users size={16} />{collaboration.presenting ? "Stop presenting" : "Present viewport"}</button><button type="button" className="end-room" onClick={() => { collaborationController.endRoom(); onClose(); }}>End room</button></div>
      </>}
    </section>
  </div>;
}
