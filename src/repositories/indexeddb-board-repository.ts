import { openDB, type DBSchema } from "idb";
import type { BoardDocument, BoardSummary } from "@/core/board/types";
import { boardSchema } from "@/schemas/board-schema";
import type { BoardRepository } from "./board-repository";

interface DraftspaceDb extends DBSchema {
  boards: { key: string; value: BoardDocument; indexes: { "by-updated": string } };
}

const database = () => openDB<DraftspaceDb>("draftspace", 1, {
  upgrade(db) {
    const store = db.createObjectStore("boards", { keyPath: "id" });
    store.createIndex("by-updated", "updatedAt");
  },
});

export class IndexedDbBoardRepository implements BoardRepository {
  async create(board: BoardDocument) { (await database()).add("boards", board); }
  async update(board: BoardDocument) { (await database()).put("boards", board); }
  async delete(id: string) { (await database()).delete("boards", id); }
  async getById(id: string) {
    const raw = await (await database()).get("boards", id);
    if (!raw) return null;
    return boardSchema.parse(raw) as BoardDocument;
  }
  async list(): Promise<BoardSummary[]> {
    const boards = await (await database()).getAllFromIndex("boards", "by-updated");
    return boards.reverse().map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, elementCount: b.elementIds.length }));
  }
}
