"use client";

import { Download, HelpCircle, Menu, Redo2, Undo2 } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { PersistenceStatus } from "./persistence-status";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import { Tooltip } from "@/components/ui/tooltip";

export function TopBar({ persistence }: { persistence: PersistenceController }) {
  const board = useBoardStore((s) => s.board);
  const history = useBoardStore((s) => s.history); const rename = useBoardStore((s) => s.rename);
  if (!board) return null;
  return <header className="top-bar" aria-label="Board controls">
    <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <Tooltip className="mobile-only" side="bottom" align="start" label="Board menu" description="Board options — coming soon">{(tooltipId) => <button type="button" className="icon-button" aria-label="Board menu" aria-describedby={tooltipId}><Menu size={18} /></button>}</Tooltip>
    <input key={board.name} className="board-name" aria-label="Board name" defaultValue={board.name} onBlur={(e) => rename(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    <div className="top-actions">
      <PersistenceStatus controller={persistence} />
      <span className="divider" />
      <Tooltip side="bottom" label="Undo" description="Reverse the last board change" shortcut="⌘/Ctrl Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().undo()} disabled={!history.undo.length} aria-label="Undo" aria-describedby={tooltipId}><Undo2 size={17} /></button>}</Tooltip>
      <Tooltip side="bottom" label="Redo" description="Restore the last undone change" shortcut="⌘/Ctrl ⇧ Z">{(tooltipId) => <button type="button" className="icon-button" onClick={() => useBoardStore.getState().redo()} disabled={!history.redo.length} aria-label="Redo" aria-describedby={tooltipId}><Redo2 size={17} /></button>}</Tooltip>
      <span className="divider" />
      <Tooltip className="desktop-secondary" side="bottom" label="Export" description="Download options arrive in Phase 4">{(tooltipId) => <button type="button" className="icon-button" aria-label="Export" aria-describedby={tooltipId}><Download size={17} /></button>}</Tooltip>
      <Tooltip className="desktop-secondary" side="bottom" align="end" label="Keyboard shortcuts" description="Shortcut reference — coming soon">{(tooltipId) => <button type="button" className="icon-button" aria-label="Help and keyboard shortcuts" aria-describedby={tooltipId}><HelpCircle size={17} /></button>}</Tooltip>
    </div>
  </header>;
}
