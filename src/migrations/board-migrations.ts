import { boardV1Schema } from "@/schemas/board-schema";

export type BoardMigrationResult =
  | { ok: true; value: unknown; migrated: boolean }
  | { ok: false; reason: "invalid-document" }
  | { ok: false; reason: "unsupported-version"; schemaVersion?: number };

export function migrateStoredBoard(raw: unknown, schemaVersion?: number): BoardMigrationResult {
  if (schemaVersion === undefined || schemaVersion === 2) return { ok: true, value: raw, migrated: false };
  if (schemaVersion === 1) {
    const legacy = boardV1Schema.safeParse(raw);
    if (!legacy.success) return { ok: false, reason: "invalid-document" };
    return { ok: true, value: { ...legacy.data, schemaVersion: 2 }, migrated: true };
  }
  return { ok: false, reason: "unsupported-version", schemaVersion };
}
