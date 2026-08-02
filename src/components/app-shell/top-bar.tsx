"use client";

import { useEffect, useRef, useState } from "react";
import { Boxes, Download, HelpCircle, Menu, PencilRuler, Radio, Redo2, SlidersHorizontal, Undo2, UserRoundPlus } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { PersistenceStatus } from "./persistence-status";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import { Tooltip } from "@/components/ui/tooltip";
import { InspectorModeControls } from "@/components/inspector/inspector-mode-controls";
import { useUiPreferencesStore } from "@/stores/ui-preferences-store";
import { ShareRoomDialog } from "@/components/collaboration/share-room-dialog";
import { LiveRoomStatus } from "@/components/collaboration/live-room-status";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { collaborationEnabled } from "@/features/collaboration/collaboration-enabled";

export function TopBar({ persistence }: { persistence?: PersistenceController }) {
  const board = useBoardStore((s) => s.board);
  const history = useBoardStore((s) => s.history); const rename = useBoardStore((s) => s.rename);
  const inspectorMode = useUiPreferencesStore((state) => state.inspector.mode);
  const viewMode = useUiPreferencesStore((state) => state.viewMode);
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false); const collaborationMode = useCollaborationStore((state) => state.mode); const collaborationStatus = useCollaborationStore((state) => state.status); const collaborationRole = useCollaborationStore((state) => state.role); const collaborationSelf = useCollaborationStore((state) => state.self); const participantCount = useCollaborationStore((state) => Object.keys(state.participants).length + 1); const pendingCount = useCollaborationStore((state) => Object.keys(state.pending).length);
  const guestReadOnly = collaborationMode === "guest" && (collaborationStatus !== "connected" || collaborationRole !== "editor");
  const actorId = collaborationSelf?.id ?? "local";
  const canUndo = history.undo.some((entry) => entry.metadata?.actorId === actorId);
  const canRedo = history.redo.some((entry) => entry.metadata?.actorId === actorId);
  const inspectorMenuRef = useRef<HTMLDivElement>(null);
  const inspectorButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!inspectorMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!inspectorMenuRef.current?.contains(event.target as Node)) setInspectorMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [inspectorMenuOpen]);
  if (!board) return null;
  return <header className="top-bar" aria-label="Board controls">
    <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <Tooltip className="mobile-only" side="bottom" align="start" label="Board menu" description="Board options — coming soon">{(tooltipId) => <button type="button" className="icon-button" aria-label="Board menu" aria-describedby={tooltipId}><Menu size={18} /></button>}</Tooltip>
    <input key={board.name} className="board-name" aria-label="Board name" defaultValue={board.name} disabled={guestReadOnly} onBlur={(e) => rename(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    <div className="top-actions">
      {persistence ? <PersistenceStatus controller={persistence} /> : <LiveRoomStatus />}
      <Tooltip side="bottom" label={viewMode === "canvas" ? "3D space" : "2D canvas"} description={viewMode === "canvas" ? "View this board as a tiered 3D system diagram" : "Back to the flat whiteboard"}>{(tooltipId) => <button type="button" className={`icon-button ${viewMode === "space" ? "live" : ""}`} aria-label={viewMode === "canvas" ? "Switch to 3D space" : "Switch to 2D canvas"} aria-describedby={tooltipId} onClick={() => useUiPreferencesStore.getState().setViewMode(viewMode === "canvas" ? "space" : "canvas")}>{viewMode === "canvas" ? <Boxes size={17} /> : <PencilRuler size={17} />}</button>}</Tooltip>
      {persistence && collaborationEnabled && <Tooltip side="bottom" label={collaborationMode === "host" ? "Live room" : "Share"} description={pendingCount ? `${pendingCount} join request${pendingCount === 1 ? "" : "s"} waiting` : collaborationMode === "host" ? `${participantCount} people connected` : "Invite people into this board"}>{(tooltipId) => <button ref={shareButtonRef} type="button" className={`icon-button share-button ${collaborationMode === "host" && collaborationStatus === "connected" ? "live" : ""} ${pendingCount ? "pending" : ""}`} aria-label="Share board" aria-describedby={tooltipId} onClick={() => setShareOpen(true)}>{collaborationMode === "host" ? <Radio size={17} /> : <UserRoundPlus size={17} />}{collaborationMode === "host" && <b>{pendingCount || participantCount}</b>}</button>}</Tooltip>}
      <span className="divider" />
      <div className="inspector-menu-wrap" ref={inspectorMenuRef} onKeyDown={(event) => {
        if (event.key === "Escape") { setInspectorMenuOpen(false); inspectorButtonRef.current?.focus(); return; }
        if (!inspectorMenuOpen || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = [...(inspectorMenuRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? [])];
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
        items[next]?.focus();
      }}>
        <Tooltip className={inspectorMenuOpen ? "menu-open" : ""} side="bottom" label="Inspector" description="Choose floating, right sidebar, or hidden">{(tooltipId) => <button ref={inspectorButtonRef} type="button" className="icon-button" aria-label="Inspector layout" aria-describedby={tooltipId} aria-haspopup="menu" aria-expanded={inspectorMenuOpen} aria-controls="inspector-layout-menu" onClick={() => setInspectorMenuOpen((open) => !open)}><SlidersHorizontal size={17} /></button>}</Tooltip>
        {inspectorMenuOpen && <div className="inspector-mode-popover" id="inspector-layout-menu" role="menu" aria-label="Inspector layout">
          {inspectorMode === "hidden" && <button type="button" role="menuitem" className="inspector-show-last" onClick={() => { useUiPreferencesStore.getState().showInspector(); setInspectorMenuOpen(false); }}><SlidersHorizontal size={17} /><span><strong>Show inspector</strong><small>Restore the last visible layout</small></span></button>}
          <InspectorModeControls presentation="menu" mode={inspectorMode} onSelect={(mode) => { useUiPreferencesStore.getState().setInspectorMode(mode); setInspectorMenuOpen(false); }} />
        </div>}
      </div>
      <Tooltip side="bottom" label="Undo" description="Reverse the last board change" shortcut="⌘/Ctrl Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().undo(actorId)} disabled={!canUndo || guestReadOnly} aria-label="Undo" aria-describedby={tooltipId}><Undo2 size={17} /></button>}</Tooltip>
      <Tooltip side="bottom" label="Redo" description="Restore the last undone change" shortcut="⌘/Ctrl ⇧ Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().redo(actorId)} disabled={!canRedo || guestReadOnly} aria-label="Redo" aria-describedby={tooltipId}><Redo2 size={17} /></button>}</Tooltip>
      <span className="divider" />
      <Tooltip className="desktop-secondary" side="bottom" label="Export" description="Download options arrive in Phase 4">{(tooltipId) => <button type="button" className="icon-button" aria-label="Export" aria-describedby={tooltipId}><Download size={17} /></button>}</Tooltip>
      <Tooltip className="desktop-secondary" side="bottom" align="end" label="Keyboard shortcuts" description="Shortcut reference — coming soon">{(tooltipId) => <button type="button" className="icon-button" aria-label="Help and keyboard shortcuts" aria-describedby={tooltipId}><HelpCircle size={17} /></button>}</Tooltip>
    </div>
    {shareOpen && <ShareRoomDialog onClose={() => setShareOpen(false)} returnFocusRef={shareButtonRef} />}
  </header>;
}
