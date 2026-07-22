import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Room } from "../src/room";
import type { ClientMessage, ServerMessage } from "@draftspace/collaboration-protocol";

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
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000);
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type !== type) return;
      clearTimeout(timeout); socket.removeEventListener("message", listener); resolve(message);
    };
    socket.addEventListener("message", listener);
  });
}

function send(socket: WebSocket, message: ClientMessage) { socket.send(JSON.stringify(message)); }

describe("collaboration room worker", () => {
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

    const kicked = nextMessage(guest, "participant.kicked"); send(host, { type: "host.kick", participantId: request.participant.participantId });
    expect((await kicked).type).toBe("participant.kicked");
    const stub = env.ROOMS.get(env.ROOMS.idFromName(created.code));
    await runInDurableObject(stub, async (_instance: Room, state) => {
      const metadata = await state.storage.get<{ participants: unknown[] }>("metadata");
      expect(metadata?.participants).toEqual([]);
    });
    host.close();
  });
});
