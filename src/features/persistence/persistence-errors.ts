export type PersistenceErrorCode =
  | "storage-unavailable"
  | "read-failed"
  | "write-failed"
  | "validation-failed"
  | "unsupported-version"
  | "backup-failed";

export type PersistenceError = {
  code: PersistenceErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
};

const PERSISTENCE_ERROR_CODES = new Set<string>([
  "storage-unavailable",
  "read-failed",
  "write-failed",
  "validation-failed",
  "unsupported-version",
  "backup-failed",
] satisfies PersistenceErrorCode[]);

export function persistenceError(code: PersistenceErrorCode, message: string, retryable: boolean, cause?: unknown): PersistenceError {
  return { code, message, retryable, cause };
}

export function normalizePersistenceError(error: unknown, operation: "read" | "write" = "write"): PersistenceError {
  if (isPersistenceError(error)) return error;
  const name = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
  if (name === "SecurityError" || name === "InvalidStateError" || typeof indexedDB === "undefined") {
    return persistenceError("storage-unavailable", "Local storage is unavailable in this browser.", true, error);
  }
  if (operation === "read") return persistenceError("read-failed", "Draftspace could not read the local board.", true, error);
  return persistenceError("write-failed", name === "QuotaExceededError" ? "Browser storage is full." : "Draftspace could not save the latest changes.", true, error);
}

export function isPersistenceError(value: unknown): value is PersistenceError {
  return Boolean(
    value && typeof value === "object"
    && "code" in value && typeof value.code === "string" && PERSISTENCE_ERROR_CODES.has(value.code)
    && "message" in value && typeof value.message === "string"
    && "retryable" in value && typeof value.retryable === "boolean",
  );
}
