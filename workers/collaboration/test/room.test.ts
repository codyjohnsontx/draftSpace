import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { numberEnv, type Room } from "../src/room";
import type { ClientMessage, ServerMessage } from "@draftspace/collaboration-protocol";
import { tokenHash, tokenMatchesHash } from "../src/security";

const origin = "http://127.0.0.1:3000";

async function createRoom() {
  const response = await SELF.fetch("https://collaboration.test/rooms", { method: "POST", headers: { Origin: origin } });
  return response.json<{ code: string; hostToken: string; roomId: string; websocketUrl: string }>();
}

async function openSocket(code: string) {
  const response = await SELF.fetch(`https://collaboration.test/rooms/${code}/connect`, { headers: { Origin: origin, Upgrade: "websocket" } });
  const socket = response.webSocket!; socket.accept();
  return socket;
}

function nextMessage(socket: WebSocket, type: ServerMessage["type"]): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", listener);
      reject(new Error(`Timed out waiting for ${type}`));
    }, 2000);
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type !== type) return;
      clearTimeout(timeout); socket.removeEventListener("message", listener); resolve(message);
    };
    socket.addEventListener("message", listener);
  });
}

function send(socket: WebSocket, message: ClientMessage) { socket.send(JSON.stringify(message)); }

function collectErrors(socket: WebSocket, count: number): Promise<Array<Extract<ServerMessage, { type: "error" }>>> {
  return new Promise((resolve, reject) => {
    const errors: Array<Extract<ServerMessage, { type: "error" }>> = [];
    const timeout = setTimeout(() => { socket.removeEventListener("message", listener); reject(new Error(`Timed out waiting for ${count} errors`)); }, 2000);
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type !== "error") return;
      errors.push(message);
      if (errors.length !== count) return;
      clearTimeout(timeout); socket.removeEventListener("message", listener); resolve(errors);
    };
    socket.addEventListener("message", listener);
  });
}

describe("collaboration room worker", () => {
  it("uses safe numeric defaults for blank and invalid configuration", () => {
    expect(numberEnv(undefined, 100)).toBe(100);
    expect(numberEnv("", 100)).toBe(100);
    expect(numberEnv("   ", 100)).toBe(100);
    expect(numberEnv("invalid", 100)).toBe(100);
    expect(numberEnv("42", 100)).toBe(42);
  });

  it("compares host token digests without comparing their hex strings", async () => {
    const hash = await tokenHash("host-secret");
    expect(await tokenMatchesHash("host-secret", hash)).toBe(true);
    expect(await tokenMatchesHash("wrong-secret", hash)).toBe(false);
    expect(await tokenMatchesHash("host-secret", "invalid")).toBe(false);
  });

  it("creates an ephemeral room without storing board content", async () => {
    const created = await createRoom();
    expect(created.code).toMatch(/^[0-9A-Z]{10}$/);
    expect(created.hostToken.length).toBeGreaterThan(30);
    expect(created.websocketUrl).toContain(`/rooms/${created.code}/connect`);

    const stub = env.ROOMS.get(env.ROOMS.idFromName(created.code));
    await runInDurableObject(stub, async (_instance: Room, state) => {
      const stored = await state.storage.list();
      expect([...stored.keys()]).toEqual(["metadata"]);
      expect(JSON.stringify(stored.get("metadata"))).not.toContain("elements");
      expect(JSON.stringify(stored.get("metadata"))).not.toContain(created.hostToken);
    });
  });

  it("rejects untrusted origins", async () => {
    const response = await SELF.fetch("https://collaboration.test/rooms", { method: "POST", headers: { Origin: "https://example.com" } });
    expect(response.status).toBe(403);
  });

  it("holds guests in the lobby and relays only admitted editor commands", async () => {
    const created = await createRoom();
    const host = await openSocket(created.code); const guest = await openSocket(created.code);
    const hostAck = nextMessage(host, "hello.ack");
    send(host, { type: "hello", protocolVersion: 1, mode: "host", token: created.hostToken, profile: { id: "host-profile", displayName: "Cody", color: "#b85f3f" } });
    expect((await hostAck).type).toBe("hello.ack");

    const joinRequest = nextMessage(host, "join.request"); const guestAck = nextMessage(guest, "hello.ack");
    send(guest, { type: "hello", protocolVersion: 1, mode: "guest", profile: { id: "guest-profile", displayName: "Alex", color: "#4f6fa8" } });
    const pending = await guestAck; expect(pending.type === "hello.ack" && pending.role).toBe("pending");
    const request = await joinRequest; if (request.type !== "join.request") throw new Error("Expected a join request");

    const admitted = nextMessage(guest, "room.admitted");
    send(host, { type: "host.admit", participantId: request.participant.participantId, role: "editor" });
    expect((await admitted).type).toBe("room.admitted");

    const proposal = { protocolVersion: 1 as const, commandId: "command-1", boardId: "board-1", actorId: request.participant.participantId, baseRevision: 0, command: { type: "board.update", patch: { name: "Shared" } }, metadata: { label: "Rename board", intent: "rename" as const } };
    const relayed = nextMessage(host, "command.propose"); send(guest, { type: "command.propose", proposal });
    expect((await relayed).type).toBe("command.propose");

    const accepted = nextMessage(guest, "command.accept");
    send(host, { type: "command.accept", participantId: request.participant.participantId, proposal });
    const result = await accepted; expect(result.type === "command.accept" && result.roomRevision).toBe(1);

    const staleRevision = nextMessage(host, "error");
    send(host, { type: "command.accept", participantId: request.participant.participantId, proposal });
    const staleResult = await staleRevision;
    expect(staleResult.type === "error" && staleResult.code).toBe("stale-revision");

    const kicked = nextMessage(guest, "participant.kicked"); send(host, { type: "host.kick", participantId: request.participant.participantId });
    expect((await kicked).type).toBe("participant.kicked");
    const stub = env.ROOMS.get(env.ROOMS.idFromName(created.code));
    await runInDurableObject(stub, async (_instance: Room, state) => {
      const metadata = await state.storage.get<{ participants: unknown[]; roomRevision: number }>("metadata");
      expect(metadata?.participants).toEqual([]);
      expect(metadata?.roomRevision).toBe(1);
    });
    host.close();
  });

  it("supersedes a stale host connection and restores pending lobby requests", async () => {
    const created = await createRoom();
    const originalHost = await openSocket(created.code);
    const originalAck = nextMessage(originalHost, "hello.ack");
    send(originalHost, { type: "hello", protocolVersion: 1, mode: "host", token: created.hostToken, profile: { id: "host-profile", displayName: "Cody", color: "#b85f3f" } });
    await originalAck;

    const guest = await openSocket(created.code);
    const joinRequest = nextMessage(originalHost, "join.request");
    send(guest, { type: "hello", protocolVersion: 1, mode: "guest", profile: { id: "guest-profile", displayName: "Alex", color: "#4f6fa8" } });
    await joinRequest;

    const replacementHost = await openSocket(created.code);
    const replacementAck = nextMessage(replacementHost, "hello.ack");
    const replayedRequest = nextMessage(replacementHost, "join.request");
    const originalClosed = new Promise<void>((resolve) => originalHost.addEventListener("close", () => resolve(), { once: true }));
    send(replacementHost, { type: "hello", protocolVersion: 1, mode: "host", token: created.hostToken, profile: { id: "replacement-host-profile", displayName: "Cody", color: "#b85f3f" } });

    expect((await replacementAck).type).toBe("hello.ack");
    expect((await replayedRequest).type).toBe("join.request");
    await originalClosed;
    replacementHost.close(); guest.close();
  });

  it("rate limits invalid frames before parsing their contents", async () => {
    const created = await createRoom();
    const socket = await openSocket(created.code);
    const errors = collectErrors(socket, 121);
    for (let attempt = 0; attempt < 121; attempt += 1) socket.send("{");
    const results = await errors;
    expect(results.slice(0, 120).every((message) => message.code === "invalid-json")).toBe(true);
    expect(results[120]?.code).toBe("rate-limited");
    socket.close();
  });

  it("rate limits room creation by request identity", async () => {
    const headers = { Origin: origin, "CF-Connecting-IP": "192.0.2.10" };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await SELF.fetch("https://collaboration.test/rooms", { method: "POST", headers })).status).toBe(201);
    }
    expect((await SELF.fetch("https://collaboration.test/rooms", { method: "POST", headers })).status).toBe(429);
  });
});
