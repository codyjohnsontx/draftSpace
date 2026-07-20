export type BoardMigrationResult =
  | { ok: true; value: unknown; migrated: boolean }
  | { ok: false; reason: "unsupported-version"; schemaVersion?: number };

export function migrateStoredBoard(raw: unknown, schemaVersion?: number): BoardMigrationResult {
  if (schemaVersion === undefined || schemaVersion === 2) return { ok: true, value: raw, migrated: false };
  if (schemaVersion === 1 && raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: { ...raw, schemaVersion: 2 }, migrated: true };
  }
  return { ok: false, reason: "unsupported-version", schemaVersion };
}
