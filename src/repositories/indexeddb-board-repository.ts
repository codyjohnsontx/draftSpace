import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BoardDocument, BoardSummary } from "@/core/board/types";
import type { BoardRepository } from "./board-repository";
import { normalizePersistenceError } from "@/features/persistence/persistence-errors";

interface DraftspaceDb extends DBSchema {
  boards: { key: string; value: BoardDocument; indexes: { "by-updated": string } };
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
    return withDatabase("read", async (db) => { const boards = await db.getAllFromIndex("boards", "by-updated"); return boards.reverse().map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, elementCount: b.elementIds.length })); });
  }
}
