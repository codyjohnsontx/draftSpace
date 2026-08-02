import { boardV1Schema, boardV2Schema } from "@/schemas/board-schema";

export type BoardMigrationResult =
  | { ok: true; value: unknown; migrated: boolean }
  | { ok: false; reason: "invalid-document" }
  | { ok: false; reason: "unsupported-version"; schemaVersion?: number };

/** v3 adds the connector collections; earlier documents gain empty ones. */
const toV3 = (board: Record<string, unknown>): Record<string, unknown> => ({
  ...board,
  schemaVersion: 3,
  connectorIds: [],
  connectors: {},
});

export function migrateStoredBoard(raw: unknown, schemaVersion?: number): BoardMigrationResult {
  if (schemaVersion === undefined || schemaVersion === 3) return { ok: true, value: raw, migrated: false };
  if (schemaVersion === 2) {
    const legacy = boardV2Schema.safeParse(raw);
    if (!legacy.success) return { ok: false, reason: "invalid-document" };
    return { ok: true, value: toV3(legacy.data), migrated: true };
  }
  if (schemaVersion === 1) {
    const legacy = boardV1Schema.safeParse(raw);
    if (!legacy.success) return { ok: false, reason: "invalid-document" };
    return { ok: true, value: toV3(legacy.data), migrated: true };
  }
  return { ok: false, reason: "unsupported-version", schemaVersion };
}
