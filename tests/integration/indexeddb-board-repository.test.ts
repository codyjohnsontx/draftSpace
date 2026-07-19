import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB, openDB } from "idb";
import { createBoard } from "@/core/board/factory";
import { IndexedDbBoardRepository } from "@/repositories/indexeddb-board-repository";
import { createBenchmarkBoard } from "@/features/performance/benchmark-fixtures";
import { boardSchema } from "@/schemas/board-schema";

beforeEach(async () => { await deleteDB("draftspace"); });

describe("IndexedDbBoardRepository", () => {
  it("writes and returns valid boards as raw records", async () => {
    const repository = new IndexedDbBoardRepository(); const board = createBoard(); await repository.create(board);
    expect(await repository.getRawById(board.id)).toEqual(board);
  });
  it("returns corrupt records without parsing or modifying them", async () => {
    const db = await openDB("draftspace", 1, { upgrade(database) { database.createObjectStore("boards", { keyPath: "id" }).createIndex("by-updated", "updatedAt"); } });
    const raw = { id: "broken", updatedAt: new Date().toISOString(), unexpected: true }; await db.put("boards", raw); db.close();
    expect(await new IndexedDbBoardRepository().getRawById("broken")).toEqual(raw);
  });
  it("skips corrupt records when listing valid board summaries", async () => {
    const repository = new IndexedDbBoardRepository(); const board = createBoard("Valid board"); await repository.create(board);
    const db = await openDB("draftspace", 1); await db.put("boards", { id: "broken", updatedAt: new Date().toISOString(), unexpected: true }); db.close();
    expect(await repository.list()).toEqual([{ id: board.id, name: board.name, createdAt: board.createdAt, updatedAt: board.updatedAt, elementCount: 0 }]);
  });
  it("round-trips a portable 1,000-element benchmark board", async () => {
    const repository = new IndexedDbBoardRepository(); const board = createBenchmarkBoard({ elementCount: 1000, layout: "distributed" });
    await repository.create(board); const restored = await repository.getRawById(board.id);
    expect(restored).toEqual(board); expect(boardSchema.safeParse(restored).success).toBe(true);
  });
});
