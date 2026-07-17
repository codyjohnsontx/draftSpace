import { describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { serializeBoardBackup, serializeRecoveryBackup } from "@/features/persistence/backup";

describe("persistence backups", () => {
  it("serializes a portable board without mutation", () => {
    const board = createBoard("System map"); const before = structuredClone(board); const result = serializeBoardBackup(board);
    expect(result.ok).toBe(true); expect(board).toEqual(before);
    if (result.ok) { expect(JSON.parse(result.json)).toEqual(board); expect(result.filename).toContain("system-map"); }
  });
  it("wraps raw recovery data without mutation", () => {
    const raw = { unexpected: true }; const result = serializeRecoveryBackup({ boardId: "bad", raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: [] });
    expect(result.ok).toBe(true); expect(raw).toEqual({ unexpected: true });
    if (result.ok) expect(JSON.parse(result.json).fileFormat).toBe("draftspace/recovery");
  });
  it("reports circular recovery values instead of throwing", () => {
    const raw: Record<string, unknown> = {}; raw.self = raw;
    const result = serializeRecoveryBackup({ boardId: "bad", raw, detectedAt: new Date().toISOString(), reason: "invalid", issues: [] });
    expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("backup-failed");
  });
});
