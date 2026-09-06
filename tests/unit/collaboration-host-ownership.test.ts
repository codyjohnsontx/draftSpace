import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, type ClientMessage, type ParticipantProfile, type ServerMessage } from "@draftspace/collaboration-protocol";
import { CollaborationController, collaborationController } from "@/features/collaboration/collaboration-controller";
import type { CollaborationTransport } from "@/features/collaboration/collaboration-transport";
import { createBoard, createShape } from "@/core/board/factory";
import { setBoardOwnershipProvider } from "@/core/commands/board-command";
import { useBoardStore } from "@/stores/board-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { BoardAccess } from "@/stores/persistence-store";

type Handlers = Parameters<CollaborationTransport["connect"]>[1];

class FakeTransport implements CollaborationTransport {
  sent: ClientMessage[] = [];
  url: string | null = null;
  private handlers: Handlers | null = null;
  connect(url: string, handlers: Handlers) { this.url = url; this.handlers = handlers; handlers.onOpen(); }
  send(message: ClientMessage) { this.sent.push(message); }
  close() { this.handlers = null; }
  receive(message: ServerMessage) { this.handlers?.onMessage(message); }
  ofType<T extends ClientMessage["type"]>(type: T) { return this.sent.filter((message): message is Extract<ClientMessage, { type: T }> => message.type === type); }
}

const profile: ParticipantProfile = { id: "host-1", displayName: "Ada", color: "#b85f3f" };
const guest = { id: "guest-1", participantId: "guest-1", displayName: "Bo", color: "#4f6fa8", role: "editor" as const };
const roomResponse = { ok: true, json: async () => ({ code: "ABCD", hostToken: "host-token", websocketUrl: "ws://room/connect" }) } as Response;

const access = (boardAccess: BoardAccess) => usePersistenceStore.setState({ boardAccess });

// Importing the module constructs the app's own controller against a real WebSocket transport,
// and it listens to the same stores these tests drive. Retiring it leaves one listener.
beforeAll(() => collaborationController.dispose());

let transport: FakeTransport;
let controller: CollaborationController;
let fetchMock: ReturnType<typeof vi.fn>;

/** Opens a room the way an owner tab does, and leaves it connected as the host. */
async function hostAsOwner() {
  access("owner");
  await controller.startHost(profile);
  transport.receive({ type: "hello.ack", participantId: "host-1", role: "host", roomRevision: 0 });
  return useCollaborationStore.getState();
}

beforeEach(() => {
  transport = new FakeTransport();
  controller = new CollaborationController(transport);
  fetchMock = vi.fn().mockResolvedValue(roomResponse);
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  useBoardStore.getState().setBoard(createBoard("Payments architecture"));
  access("owner");
});

afterEach(() => {
  controller.dispose();
  vi.unstubAllGlobals();
  useCollaborationStore.getState().reset();
  usePersistenceStore.setState({ boardAccess: "owner" });
  setBoardOwnershipProvider(() => true);
  useBoardStore.setState({ board: null });
});

/**
 * A tab that does not hold the board's claim starts no autosave at all, so a room hosted from
 * it would take its guests' edits, show them, and drop every one of them when the room closed.
 * The refusal is asserted at the controller because that is what creates the room: the disabled
 * Share control is a courtesy, and `startHost` is reachable without it.
 */
describe("hosting a live room needs the board", () => {
  it("refuses a room to a tab another tab is editing", async () => {
    access("read-only");

    await controller.startHost(profile);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(transport.url).toBeNull();
    expect(sessionStorage.getItem("draftspace:collaboration-host")).toBeNull();
    const state = useCollaborationStore.getState();
    expect(state.mode).toBe("local");
    expect(state.status).toBe("idle");
    expect(state.error).toBe("Another tab is editing this board, so it cannot be shared from here.");
  });

  it("refuses a room while a claim is being handed over", async () => {
    access("pending");

    await controller.startHost(profile);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useCollaborationStore.getState().mode).toBe("local");
  });

  it("opens the room for the tab that holds the board", async () => {
    const state = await hostAsOwner();

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/rooms", expect.objectContaining({ method: "POST" }));
    expect(transport.url).toBe("ws://room/connect");
    expect(state.mode).toBe("host");
    expect(useCollaborationStore.getState().status).toBe("connected");
    expect(JSON.parse(sessionStorage.getItem("draftspace:collaboration-host") ?? "null")).toMatchObject({ mode: "host", code: "ABCD" });
  });

  it("refuses to restore a stored host session in a tab that no longer holds the board", () => {
    sessionStorage.setItem("draftspace:collaboration-host", JSON.stringify({ mode: "host", code: "ABCD", token: "host-token", url: "ws://room/connect", profile }));
    access("read-only");

    expect(controller.resumeHost()).toBe(false);
    expect(transport.url).toBeNull();
    // The session is kept: this tab may be promoted later, and the room is resumable until then.
    expect(sessionStorage.getItem("draftspace:collaboration-host")).not.toBeNull();
    expect(controller.resumeHost()).toBe(false);

    access("owner");
    expect(controller.resumeHost()).toBe(true);
    expect(transport.url).toBe("ws://room/connect");
  });

  /**
   * Hosting is a state rather than a moment. A tab that lets the board go mid-room stops saving,
   * so the room has to end with it instead of running on and discarding what the guests draw.
   */
  it("closes a live room when the tab stops holding the board", async () => {
    await hostAsOwner();
    transport.sent.length = 0;

    access("read-only");

    expect(transport.ofType("host.end")).toHaveLength(1);
    const state = useCollaborationStore.getState();
    expect(state.mode).toBe("local");
    expect(state.error).toBe("The live room closed because this tab is no longer editing this board.");
  });

  it("leaves a room alone while the tab keeps the board", async () => {
    await hostAsOwner();
    transport.sent.length = 0;

    usePersistenceStore.getState().markSaving(1);
    usePersistenceStore.getState().markSaved(1, new Date().toISOString());

    expect(transport.ofType("host.end")).toHaveLength(0);
    expect(useCollaborationStore.getState().mode).toBe("host");
  });
});

/**
 * The other half of the guarantee: a guest is a non-owner by definition, and a room a legitimate
 * host opened must still take their edits. Nothing here narrows that path.
 */
describe("a guest still edits a legitimately hosted room", () => {
  it("applies an admitted guest's proposal to the host's board and accepts it", async () => {
    await hostAsOwner();
    transport.receive({ type: "participant.joined", participant: guest });
    transport.sent.length = 0;
    const element = createShape("rectangle", { x: 10, y: 20, width: 100, height: 80 });

    transport.receive({ type: "command.propose", participantId: guest.participantId, proposal: {
      protocolVersion: PROTOCOL_VERSION,
      commandId: "guest-command",
      boardId: useBoardStore.getState().board!.id,
      actorId: guest.participantId,
      baseRevision: 0,
      command: { type: "elements.create", elements: [element] },
      metadata: { label: "Rectangle", intent: "create" },
    } });

    expect(useBoardStore.getState().board?.elementIds).toEqual([element.id]);
    expect(transport.ofType("command.accept")).toHaveLength(1);
    expect(useCollaborationStore.getState().roomRevision).toBe(1);
  });

  it("proposes an admitted guest's own edit from the guest tab", () => {
    controller.join("ABCD", { id: guest.id, displayName: guest.displayName, color: guest.color });
    transport.receive({ type: "hello.ack", participantId: guest.participantId, role: "editor", roomRevision: 3 });
    transport.sent.length = 0;

    useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 60, height: 40 });

    expect(transport.ofType("command.propose")).toHaveLength(1);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(1);
  });
});
