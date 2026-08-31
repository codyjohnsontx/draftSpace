"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { BoardSummary } from "@/core/board/types";
import { useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

const elementSummary = (count: number) => count === 1 ? "1 element" : `${count} elements`;

/** Enough of a timestamp to tell two boards apart, and nothing when the record has no usable one. */
function updatedSummary(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Lists the boards this browser holds and opens the one that is picked.
 *
 * It stays out of the way until there is somewhere to go: with a single board the control is not
 * rendered at all, so the ordinary one-board session gains no menu that only ever names the board
 * already on screen.
 */
export function BoardSwitcher({ controller }: { controller: PersistenceController }) {
  const boards = usePersistenceStore((state) => state.boards);
  const openBoardId = useBoardStore((state) => state.board?.id ?? null);
  const [open, setOpen] = useState(false);
  // A board can stop being readable between this list being built and the user picking it.
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  if (boards.length < 2) return null;

  // The menu stays up until the board is actually open, so a board that can no longer be read
  // says so here rather than closing on a click that did nothing.
  const choose = async (board: BoardSummary) => {
    if (board.id === openBoardId) { setOpen(false); buttonRef.current?.focus(); return; }
    setUnavailable(null);
    if (await controller.openBoard(board.id)) { setOpen(false); buttonRef.current?.focus(); return; }
    setUnavailable(board.id);
  };

  return <div className="board-switcher" ref={wrapRef} onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); return; }
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...(wrapRef.current?.querySelectorAll<HTMLElement>("[role='menuitemradio']") ?? [])];
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current <= 0 ? items.length : current) - 1;
    items[next]?.focus();
  }}>
    <button ref={buttonRef} type="button" className="board-switcher-trigger" aria-label="Open a board" aria-haspopup="menu" aria-expanded={open} aria-controls="board-switcher-menu" onClick={() => { setOpen((value) => !value); setUnavailable(null); }}>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="board-switcher-popover" id="board-switcher-menu" role="menu" aria-label="Boards in this browser">
      <p className="board-switcher-heading">Boards in this browser</p>
      {boards.map((board) => {
        const updated = updatedSummary(board.updatedAt);
        return <button key={board.id} type="button" role="menuitemradio" aria-checked={board.id === openBoardId} className="board-switcher-option" onClick={() => void choose(board)}>
          <span><strong>{board.name.trim() || "Untitled board"}</strong><small>{board.id === unavailable ? "This board can no longer be opened from this browser." : `${elementSummary(board.elementCount)}${updated ? ` · ${updated}` : ""}`}</small></span>
          {board.id === openBoardId && <Check size={16} className="mode-check" aria-hidden="true" />}
        </button>;
      })}
    </div>}
  </div>;
}
