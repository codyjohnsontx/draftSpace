import { describe, expect, it } from "vitest";
import { draftIsStored, storedRecordMovedOn } from "@/features/persistence/stored-board-stamp";

const stored = (stateId: string) => ({ id: "board-1", stateId });
const stamp = (stateId: string) => ({ boardId: "board-1", stateId });

describe("stored board stamp", () => {
  it("lets a tab write back the record it last agreed with", () => {
    expect(storedRecordMovedOn(stored("state-a"), "board-1", stamp("state-a"))).toBe(false);
  });

  it("has nothing to protect when no record is stored yet", () => {
    expect(storedRecordMovedOn(null, "board-1", null)).toBe(false);
    expect(storedRecordMovedOn(undefined, "board-1", stamp("state-a"))).toBe(false);
  });

  it("reports a record another tab advanced after this tab last read it", () => {
    // The promotion-reload failure: this tab last saw v1, the owner saved v5 before letting go.
    expect(storedRecordMovedOn(stored("state-b"), "board-1", stamp("state-a"))).toBe(true);
  });

  it("reports a stored record this tab has never seen", () => {
    expect(storedRecordMovedOn(stored("state-b"), "board-1", null)).toBe(true);
    expect(storedRecordMovedOn(stored("state-b"), "board-1", { boardId: "board-2", stateId: "state-b" })).toBe(true);
  });

  it("treats a record it cannot read a stamp from as someone else's", () => {
    expect(storedRecordMovedOn({ id: "board-1" }, "board-1", stamp("state-a"))).toBe(true);
    expect(storedRecordMovedOn("nonsense", "board-1", stamp("state-a"))).toBe(true);
  });

  it("says a draft nothing has changed since the write is one storage holds", () => {
    expect(draftIsStored(stored("state-a"), stamp("state-a"))).toBe(true);
  });

  it("says a draft edited since the write is not", () => {
    expect(draftIsStored(stored("state-b"), stamp("state-a"))).toBe(false);
  });

  it("says a draft storage has never seen is not, whatever its stamp", () => {
    expect(draftIsStored(stored("state-a"), null)).toBe(false);
    expect(draftIsStored(stored("state-a"), { boardId: "board-2", stateId: "state-a" })).toBe(false);
  });
});
