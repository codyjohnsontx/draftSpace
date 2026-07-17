import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoard } from "@/core/board/factory";
import { downloadBackup, serializeBoardBackup, serializeRecoveryBackup } from "@/features/persistence/backup";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
  it("reports browser download failures", () => {
    const createObjectURL = vi.fn(() => { throw new Error("blocked"); });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    const backup = serializeBoardBackup(createBoard()); expect(backup.ok).toBe(true);
    if (backup.ok) { const result = downloadBackup(backup); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe("backup-failed"); }
  });
  it("revokes successful download URLs", () => {
    vi.useFakeTimers(); const revokeObjectURL = vi.fn(); const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:backup"), revokeObjectURL });
    const backup = serializeBoardBackup(createBoard()); expect(backup.ok).toBe(true);
    if (backup.ok) expect(downloadBackup(backup).ok).toBe(true);
    expect(click).toHaveBeenCalledOnce(); vi.runAllTimers(); expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");
  });
});
