"use client";

import { Download, HelpCircle, Menu, Redo2, Undo2 } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { PersistenceStatus } from "./persistence-status";
import type { PersistenceController } from "@/hooks/use-board-persistence";

export function TopBar({ persistence }: { persistence: PersistenceController }) {
  const board = useBoardStore((s) => s.board);
  const history = useBoardStore((s) => s.history); const rename = useBoardStore((s) => s.rename);
  if (!board) return null;
  return <header className="top-bar" aria-label="Board controls">
    <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /><i /></span><strong>Draftspace</strong></div>
    <button className="icon-button mobile-only" aria-label="Board menu" title="Board menu"><Menu size={18} /></button>
    <input key={board.name} className="board-name" aria-label="Board name" defaultValue={board.name} onBlur={(e) => rename(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    <div className="top-actions">
      <PersistenceStatus controller={persistence} />
      <span className="divider" />
      <button className="icon-button" onClick={() => useBoardStore.getState().undo()} disabled={!history.undo.length} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={17} /></button>
      <button className="icon-button" onClick={() => useBoardStore.getState().redo()} disabled={!history.redo.length} aria-label="Redo" title="Redo (⌘⇧Z)"><Redo2 size={17} /></button>
      <span className="divider" />
      <button className="icon-button" aria-label="Export" title="Export arrives in Phase 4"><Download size={17} /></button>
      <button className="icon-button" aria-label="Help and keyboard shortcuts" title="Keyboard shortcuts"><HelpCircle size={17} /></button>
    </div>
  </header>;
}
