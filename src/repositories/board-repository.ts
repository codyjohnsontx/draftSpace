import type { BoardDocument, BoardSummary } from "@/core/board/types";

export interface BoardRepository {
  create(board: BoardDocument): Promise<void>;
  getRawById(id: string): Promise<unknown | null>;
  update(board: BoardDocument): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<BoardSummary[]>;
}
