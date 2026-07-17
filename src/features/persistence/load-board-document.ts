import type { BoardDocument } from "@/core/board/types";
import { boardSchema } from "@/schemas/board-schema";
import { migrateStoredBoard } from "@/migrations/board-migrations";

export type BoardLoadResult =
  | { kind: "missing" }
  | { kind: "ready"; board: BoardDocument }
  | { kind: "invalid"; boardId: string; raw: unknown; issues: string[] }
  | { kind: "unsupported-version"; boardId: string; raw: unknown; schemaVersion?: number };

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function loadBoardDocument(boardId: string, raw: unknown | null): BoardLoadResult {
  if (raw === null) return { kind: "missing" };
  const candidate = record(raw);
  const schemaVersion = typeof candidate?.schemaVersion === "number" ? candidate.schemaVersion : undefined;
  const migration = migrateStoredBoard(raw, schemaVersion);
  if (candidate?.fileFormat === "draftspace/board" && !migration.ok) return { kind: "unsupported-version", boardId, raw, schemaVersion: migration.schemaVersion };
  const parsed = boardSchema.safeParse(migration.ok ? migration.value : raw);
  if (parsed.success) return { kind: "ready", board: parsed.data as BoardDocument };
  return { kind: "invalid", boardId, raw, issues: parsed.error.issues.slice(0, 3).map((issue) => issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message) };
}
