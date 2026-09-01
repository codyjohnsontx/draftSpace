"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { BoardSummary } from "@/core/board/types";
import { useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { OpenBoardOutcome, PersistenceController } from "@/hooks/use-board-persistence";

const elementSummary = (count: number) => count === 1 ? "1 element" : `${count} elements`;

/** What the row says instead of its summary when the pick left the board that was open on screen. */
const refusedSummary: Record<Exclude<OpenBoardOutcome, "opened">, string> = {
  "unreadable": "This board can no longer be opened from this browser.",
  "unsaved-work": "Draftspace could not save the open board, so it stayed open.",
  // Both halves, because the second one is invisible: the board the user is still looking at was
  // let go on the way here, so it is no longer being saved and nothing else on screen says so.
  "handover-failed": "Draftspace could not open this board, and the board still on screen is no longer being saved.",
};

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
  // A pick can leave the board that is open on screen: the picked one stopped being readable
  // between this list being built and the click, the open one has work storage would not take, or
  // the open one was let go and the picked one could not be claimed in its place.
  const [refused, setRefused] = useState<{ boardId: string; outcome: Exclude<OpenBoardOutcome, "opened"> } | null>(null);
  // The menu stays up while a board opens, so a second pick must not race the first.
  const opening = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  if (boards.length < 2) return null;

  // The menu stays up until the board is actually open, so a pick that changed nothing says why
  // here rather than closing on a click that did nothing.
  const choose = async (board: BoardSummary) => {
    if (board.id === openBoardId) { setOpen(false); buttonRef.current?.focus(); return; }
    if (opening.current) return;
    opening.current = true; setRefused(null);
    try {
      const outcome = await controller.openBoard(board.id);
      if (outcome === "opened") { setOpen(false); buttonRef.current?.focus(); return; }
      setRefused({ boardId: board.id, outcome });
    } finally { opening.current = false; }
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
    <button ref={buttonRef} type="button" className="board-switcher-trigger" aria-label="Open a board" aria-haspopup="menu" aria-expanded={open} aria-controls="board-switcher-menu" onClick={() => { setOpen((value) => !value); setRefused(null); }}>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="board-switcher-popover" id="board-switcher-menu" role="menu" aria-label="Boards in this browser">
      <p className="board-switcher-heading">Boards in this browser</p>
      {boards.map((board) => {
        const updated = updatedSummary(board.updatedAt);
        return <button key={board.id} type="button" role="menuitemradio" aria-checked={board.id === openBoardId} className="board-switcher-option" onClick={() => void choose(board)}>
          <span><strong>{board.name.trim() || "Untitled board"}</strong><small>{refused?.boardId === board.id ? refusedSummary[refused.outcome] : `${elementSummary(board.elementCount)}${updated ? ` · ${updated}` : ""}`}</small></span>
          {board.id === openBoardId && <Check size={16} className="mode-check" aria-hidden="true" />}
        </button>;
      })}
    </div>}
    {/* Swapping the row's own text does not re-announce a control the reader is already on, so the
        refusal is spoken from here. It sits outside the menu, which admits no such child, and it is
        never mounted with its text: a live region that arrives already speaking announces nothing. */}
    <div className="sr-only" role="status">{open && refused ? refusedSummary[refused.outcome] : ""}</div>
  </div>;
}
