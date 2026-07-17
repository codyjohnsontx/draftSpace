export type BoardMigrationResult = { ok: true; value: unknown } | { ok: false; reason: "unsupported-version"; schemaVersion?: number };

export function migrateStoredBoard(raw: unknown, schemaVersion?: number): BoardMigrationResult {
  if (schemaVersion === undefined || schemaVersion <= 1) return { ok: true, value: raw };
  return { ok: false, reason: "unsupported-version", schemaVersion };
}
