import { describe, expect, it } from "vitest";
import { isPersistenceError, normalizePersistenceError } from "@/features/persistence/persistence-errors";

describe("persistence errors", () => {
  it("rejects error-like values with a non-string message", () => {
    const value = { code: "write-failed", message: { unsafe: true }, retryable: true };
    expect(isPersistenceError(value)).toBe(false);
    expect(typeof normalizePersistenceError(value).message).toBe("string");
  });
});
