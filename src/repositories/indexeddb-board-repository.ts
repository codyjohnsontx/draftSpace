import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BoardDocument, BoardSummary } from "@/core/board/types";
import type { BoardRepository } from "./board-repository";
import { normalizePersistenceError } from "@/features/persistence/persistence-errors";
import { loadBoardDocument } from "@/features/persistence/load-board-document";

interface DraftspaceDb extends DBSchema {
  boards: { key: string; value: unknown; indexes: { "by-updated": string } };
}

const database = () => {
  if (typeof indexedDB === "undefined") throw normalizePersistenceError(new DOMException("IndexedDB is unavailable", "SecurityError"), "read");
  return openDB<DraftspaceDb>("draftspace", 1, {
    upgrade(db) {
      const store = db.createObjectStore("boards", { keyPath: "id" });
      store.createIndex("by-updated", "updatedAt");
    },
  });
};

async function withDatabase<T>(operation: "read" | "write", run: (db: IDBPDatabase<DraftspaceDb>) => Promise<T>): Promise<T> {
  let db: IDBPDatabase<DraftspaceDb> | null = null;
  try { db = await database(); return await run(db); }
  catch (error) { throw normalizePersistenceError(error, operation); }
  finally { db?.close(); }
}

export class IndexedDbBoardRepository implements BoardRepository {
  async create(board: BoardDocument) { await withDatabase("write", async (db) => { await db.add("boards", board); }); }
  async update(board: BoardDocument) { await withDatabase("write", async (db) => { await db.put("boards", board); }); }
  async delete(id: string) { await withDatabase("write", async (db) => { await db.delete("boards", id); }); }
  async getRawById(id: string): Promise<unknown | null> { return withDatabase("read", async (db) => await db.get("boards", id) ?? null); }
  async list(): Promise<BoardSummary[]> {
    return withDatabase("read", async (db) => {
      const stored = await db.getAllFromIndex("boards", "by-updated");
      return stored.reverse().flatMap((raw) => {
        const id = raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string" ? raw.id : "unknown";
        const result = loadBoardDocument(id, raw);
        if (result.kind !== "ready") return [];
        const board = result.board;
        return [{ id: board.id, name: board.name, createdAt: board.createdAt, updatedAt: board.updatedAt, elementCount: board.elementIds.length }];
      });
    });
  }
}
