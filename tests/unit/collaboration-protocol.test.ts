import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseServerMessage } from "@draftspace/collaboration-protocol";
import { PARTICIPANT_PROFILE_KEY, loadParticipantProfile, saveParticipantProfile } from "@/features/collaboration/participant-profile";
import { createBoard } from "@/core/board/factory";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("collaboration protocol", () => {
  it("accepts versioned server messages and rejects malformed payloads", () => {
    expect(parseServerMessage({ type: "hello.ack", participantId: "guest", role: "viewer", roomRevision: 4 })).toMatchObject({ roomRevision: 4 });
    expect(parseServerMessage({ type: "hello.ack", participantId: "guest", role: "owner", roomRevision: 4 })).toBeNull();
    expect(parseServerMessage({ type: "presence.update", participantId: "guest", presence: { cursor: null, selectedElementIds: [], selectionCount: 0, activeTool: "select" } })).not.toBeNull();
  });

  it("stores only a validated participant profile without changing board serialization", () => {
    const board = createBoard(); const before = JSON.stringify(board);
    const profile = saveParticipantProfile("  Cody  ");
    expect(loadParticipantProfile()).toEqual(profile);
    expect(profile.displayName).toBe("Cody");
    expect(JSON.stringify(board)).toBe(before);

    localStorage.setItem(PARTICIPANT_PROFILE_KEY, JSON.stringify({ displayName: "Missing identity" }));
    expect(loadParticipantProfile()).toBeNull();
  });
});
