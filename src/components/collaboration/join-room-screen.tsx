"use client";

import { ArrowRight, Radio, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collaborationController } from "@/features/collaboration/collaboration-controller";
import { loadParticipantProfile, saveParticipantProfile } from "@/features/collaboration/participant-profile";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useBoardStore } from "@/stores/board-store";
import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import { StyleInspector } from "@/components/inspector/style-inspector";
import { TopBar } from "@/components/app-shell/top-bar";
import { FollowHostBanner } from "./follow-host-banner";
import { useUiPreferencesStore } from "@/stores/ui-preferences-store";
import Link from "next/link";
import { collaborationEnabled } from "@/features/collaboration/collaboration-enabled";

export function JoinRoomScreen({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase()); const existing = useMemo(() => loadParticipantProfile(), []); const [name, setName] = useState(existing?.displayName ?? "");
  const collaboration = useCollaborationStore(); const board = useBoardStore((state) => state.board);
  const hydrateUiPreferences = useUiPreferencesStore((state) => state.hydrate);
  useEffect(() => { hydrateUiPreferences(); return () => { if (useCollaborationStore.getState().mode === "guest") collaborationController.leave(); }; }, [hydrateUiPreferences]);
  useEffect(() => { if (initialCode && existing) collaborationController.resumeGuest(initialCode, existing); }, [initialCode, existing]);
  if (!collaborationEnabled) return <main className="join-room-page"><div className="join-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div><section className="join-room-panel"><span className="eyebrow"><Radio size={13} />Live room</span><h1>Live rooms are not enabled</h1><p>This build is keeping collaboration private while the remaining shape and rotation contracts are completed.</p><Link className="room-primary" href="/">Return to Draftspace</Link></section></main>;
  if (board && collaboration.boardReady && collaboration.mode === "guest" && ["connected", "host-away"].includes(collaboration.status)) return <div className="draftspace-shell guest-shell"><CanvasWorkspace /><StyleInspector /><TopBar /><FollowHostBanner />{collaboration.status === "host-away" && <div className="host-away-banner" role="status"><span className="connection-pulse" />Host connection lost. This board is read-only while Draftspace reconnects.</div>}</div>;
  const submit = () => { const profile = saveParticipantProfile(name); collaborationController.join(code, profile); };
  return <main className="join-room-page">
    <div className="join-brand"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <section className="join-room-panel">
      <span className="eyebrow"><Radio size={13} />Live room</span><h1>{collaboration.status === "lobby" ? "Waiting for the host" : collaboration.status === "ended" ? "This room has ended" : "Join the board"}</h1>
      {collaboration.status === "lobby" || (collaboration.status === "connected" && !collaboration.boardReady) ? <div className="room-waiting"><span className="connection-pulse" /><p>{collaboration.status === "lobby" ? "Your request is ready. The host can admit you as a viewer or editor." : "The host is opening the shared board…"}</p></div> : collaboration.status === "ended" ? <><p>{collaboration.error}</p><Link className="room-primary" href="/">Return to your boards</Link></> : <>
        <p>Enter the temporary code from the host. Your own local boards will not be changed.</p>
        <label className="collaboration-field"><span>Room code</span><input value={code} maxLength={10} autoFocus={!initialCode} onChange={(event) => setCode(event.currentTarget.value.replace(/[^0-9A-HJKMNPQRSTVWXYZ]/gi, "").toUpperCase())} placeholder="0A1B2C3D4E" /></label>
        <label className="collaboration-field"><span>Your display name</span><input value={name} maxLength={40} autoFocus={Boolean(initialCode)} onChange={(event) => setName(event.currentTarget.value)} placeholder="How others will see you" /></label>
        {collaboration.error && <p className="collaboration-error" role="alert">{collaboration.error}</p>}
        <button type="button" className="room-primary" disabled={code.length !== 10 || !name.trim() || collaboration.status === "connecting"} onClick={submit}>{collaboration.status === "connecting" ? "Connecting…" : "Request to join"}<ArrowRight size={17} /></button>
      </>}
      <footer><span><ShieldCheck size={14} />No account required</span><span><Users size={14} />Up to four people</span></footer>
    </section>
  </main>;
}
