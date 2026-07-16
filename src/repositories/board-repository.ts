import type { BoardDocument, BoardSummary } from "@/core/board/types";

export interface BoardRepository {
  create(board: BoardDocument): Promise<void>;
  getById(id: string): Promise<BoardDocument | null>;
  update(board: BoardDocument): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<BoardSummary[]>;
}
