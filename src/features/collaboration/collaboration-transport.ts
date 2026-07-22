import { parseServerMessage, type ClientMessage, type ServerMessage } from "@draftspace/collaboration-protocol";

export interface CollaborationTransport {
  connect(url: string, handlers: { onOpen: () => void; onMessage: (message: ServerMessage) => void; onClose: () => void; onError: () => void }): void;
  send(message: ClientMessage): void;
  close(): void;
}

export class WebSocketCollaborationTransport implements CollaborationTransport {
  private socket: WebSocket | null = null;
  connect(url: string, handlers: { onOpen: () => void; onMessage: (message: ServerMessage) => void; onClose: () => void; onError: () => void }) {
    this.close();
    const socket = new WebSocket(url); this.socket = socket;
    socket.addEventListener("open", handlers.onOpen);
    socket.addEventListener("message", (event) => {
      try {
        const message = parseServerMessage(JSON.parse(String(event.data)));
        if (message) handlers.onMessage(message); else handlers.onError();
      } catch { handlers.onError(); }
    });
    socket.addEventListener("close", handlers.onClose);
    socket.addEventListener("error", handlers.onError);
  }
  send(message: ClientMessage) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  close() { this.socket?.close(); this.socket = null; }
}
