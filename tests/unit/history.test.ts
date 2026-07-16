import { describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { emptyHistory, pushHistory, redoBoard, transact, undoBoard } from "@/features/history/history";

describe("history", () => {
  it("undoes and redoes one logical transaction", () => {
    const board = createBoard(); const tx = transact(board, "Rename", (draft) => { draft.name = "Architecture"; });
    const history = pushHistory(emptyHistory(), tx.entry!); const undone = undoBoard(tx.next, history);
    expect(undone.board.name).toBe("Untitled board"); expect(redoBoard(undone.board, undone.history).board.name).toBe("Architecture");
  });
  it("does not record no-op transactions", () => expect(transact(createBoard(), "Nothing", () => {}).entry).toBeNull());
  it("caps stored entries", () => {
    let board = createBoard(); let history = emptyHistory();
    for (let i = 0; i < 5; i++) { const tx = transact(board, "Rename", (draft) => { draft.name = `Board ${i}`; }); board = tx.next; history = pushHistory(history, tx.entry!, 3); }
    expect(history.undo).toHaveLength(3);
  });
});
