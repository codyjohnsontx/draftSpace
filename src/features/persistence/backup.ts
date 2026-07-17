import type { BoardDocument } from "@/core/board/types";
import type { RecoveryPayload } from "@/stores/persistence-store";
import { persistenceError, type PersistenceError } from "./persistence-errors";

export type BackupResult = { ok: true; json: string; filename: string } | { ok: false; error: PersistenceError };

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const safeName = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "board";

export function serializeBoardBackup(board: BoardDocument): BackupResult {
  try { return { ok: true, json: JSON.stringify(board, null, 2), filename: `draftspace-${safeName(board.name)}-${stamp()}.json` }; }
  catch (error) { return { ok: false, error: persistenceError("backup-failed", "Draftspace could not create the backup file.", false, error) }; }
}

export function serializeRecoveryBackup(recovery: RecoveryPayload): BackupResult {
  try {
    const payload = { fileFormat: "draftspace/recovery", exportedAt: new Date().toISOString(), boardId: recovery.boardId, reason: recovery.reason, raw: recovery.raw };
    return { ok: true, json: JSON.stringify(payload, null, 2), filename: `draftspace-recovery-${safeName(recovery.boardId)}-${stamp()}.json` };
  } catch (error) { return { ok: false, error: persistenceError("backup-failed", "Draftspace could not serialize the recovery data.", false, error) }; }
}

export function downloadBackup(result: Extract<BackupResult, { ok: true }>) {
  const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
