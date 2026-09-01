import { describe, expect, it } from "vitest";
import { draftIsStored, storedRecordMovedOn } from "@/features/persistence/stored-board-stamp";

const stored = (updatedAt: string) => ({ id: "board-1", updatedAt });
const stamp = (updatedAt: string) => ({ boardId: "board-1", updatedAt });

describe("stored board stamp", () => {
  it("lets a tab write back the record it last agreed with", () => {
    expect(storedRecordMovedOn(stored("2026-01-01T00:00:00.000Z"), "board-1", stamp("2026-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("has nothing to protect when no record is stored yet", () => {
    expect(storedRecordMovedOn(null, "board-1", null)).toBe(false);
    expect(storedRecordMovedOn(undefined, "board-1", stamp("2026-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("reports a record another tab advanced after this tab last read it", () => {
    // The promotion-reload failure: this tab last saw v1, the owner saved v5 before letting go.
    expect(storedRecordMovedOn(stored("2026-01-01T00:05:00.000Z"), "board-1", stamp("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("reports a stored record this tab has never seen", () => {
    expect(storedRecordMovedOn(stored("2026-01-01T00:05:00.000Z"), "board-1", null)).toBe(true);
    expect(storedRecordMovedOn(stored("2026-01-01T00:05:00.000Z"), "board-1", { boardId: "board-2", updatedAt: "2026-01-01T00:05:00.000Z" })).toBe(true);
  });

  it("treats a record it cannot read a stamp from as someone else's", () => {
    expect(storedRecordMovedOn({ id: "board-1" }, "board-1", stamp("2026-01-01T00:00:00.000Z"))).toBe(true);
    expect(storedRecordMovedOn("nonsense", "board-1", stamp("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("says a draft nothing has changed since the write is one storage holds", () => {
    expect(draftIsStored(stored("2026-01-01T00:00:00.000Z"), stamp("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("says a draft edited since the write is not", () => {
    expect(draftIsStored(stored("2026-01-01T00:05:00.000Z"), stamp("2026-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("says a draft storage has never seen is not, whatever its stamp", () => {
    expect(draftIsStored(stored("2026-01-01T00:00:00.000Z"), null)).toBe(false);
    expect(draftIsStored(stored("2026-01-01T00:00:00.000Z"), { boardId: "board-2", updatedAt: "2026-01-01T00:00:00.000Z" })).toBe(false);
  });
});
