import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseClientMessage, parseServerMessage } from "@draftspace/collaboration-protocol";
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

  it("bounds participant and command identifiers in host messages", () => {
    expect(parseClientMessage({ type: "host.admit", participantId: "guest", role: "viewer" })).not.toBeNull();
    expect(parseClientMessage({ type: "host.admit", participantId: "", role: "viewer" })).toBeNull();
    expect(parseClientMessage({ type: "host.kick", participantId: "x".repeat(129) })).toBeNull();
    expect(parseClientMessage({ type: "command.reject", participantId: "guest", commandId: "", reason: "No" })).toBeNull();
    expect(parseClientMessage({ type: "command.accept", participantId: "", proposal: { protocolVersion: 1, commandId: "command", boardId: "board", actorId: "actor", baseRevision: 0, command: {}, metadata: { label: "Edit", intent: "move" } } })).toBeNull();
    expect(parseClientMessage({ type: "snapshot.response", participantId: "x".repeat(129), board: {}, roomRevision: 0 })).toBeNull();
  });

  it("stores only a validated participant profile without changing board serialization", () => {
    const board = createBoard(); const before = JSON.stringify(board);
    const profile = saveParticipantProfile("  Cody  ");
    expect(profile).not.toBeNull();
    expect(loadParticipantProfile()).toEqual(profile);
    expect(profile?.displayName).toBe("Cody");
    expect(JSON.stringify(board)).toBe(before);

    localStorage.setItem(PARTICIPANT_PROFILE_KEY, JSON.stringify({ displayName: "Missing identity" }));
    expect(loadParticipantProfile()).toBeNull();
  });

  it("fails invalid participant names without throwing or persisting them", () => {
    expect(saveParticipantProfile("   ")).toBeNull();
    expect(localStorage.getItem(PARTICIPANT_PROFILE_KEY)).toBeNull();
  });
});
