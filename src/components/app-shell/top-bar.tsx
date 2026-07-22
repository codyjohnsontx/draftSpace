"use client";

import { useEffect, useRef, useState } from "react";
import { Download, HelpCircle, Menu, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { PersistenceStatus } from "./persistence-status";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import { Tooltip } from "@/components/ui/tooltip";
import { InspectorModeControls } from "@/components/inspector/inspector-mode-controls";
import { useUiPreferencesStore } from "@/stores/ui-preferences-store";

export function TopBar({ persistence }: { persistence: PersistenceController }) {
  const board = useBoardStore((s) => s.board);
  const history = useBoardStore((s) => s.history); const rename = useBoardStore((s) => s.rename);
  const inspectorMode = useUiPreferencesStore((state) => state.inspector.mode);
  const [inspectorMenuOpen, setInspectorMenuOpen] = useState(false);
  const inspectorMenuRef = useRef<HTMLDivElement>(null);
  const inspectorButtonRef = useRef<HTMLButtonElement>(null);
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
    <input key={board.name} className="board-name" aria-label="Board name" defaultValue={board.name} onBlur={(e) => rename(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    <div className="top-actions">
      <PersistenceStatus controller={persistence} />
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
      <Tooltip side="bottom" label="Undo" description="Reverse the last board change" shortcut="⌘/Ctrl Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().undo()} disabled={!history.undo.length} aria-label="Undo" aria-describedby={tooltipId}><Undo2 size={17} /></button>}</Tooltip>
      <Tooltip side="bottom" label="Redo" description="Restore the last undone change" shortcut="⌘/Ctrl ⇧ Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().redo()} disabled={!history.redo.length} aria-label="Redo" aria-describedby={tooltipId}><Redo2 size={17} /></button>}</Tooltip>
      <span className="divider" />
      <Tooltip className="desktop-secondary" side="bottom" label="Export" description="Download options arrive in Phase 4">{(tooltipId) => <button type="button" className="icon-button" aria-label="Export" aria-describedby={tooltipId}><Download size={17} /></button>}</Tooltip>
      <Tooltip className="desktop-secondary" side="bottom" align="end" label="Keyboard shortcuts" description="Shortcut reference — coming soon">{(tooltipId) => <button type="button" className="icon-button" aria-label="Help and keyboard shortcuts" aria-describedby={tooltipId}><HelpCircle size={17} /></button>}</Tooltip>
    </div>
  </header>;
}
