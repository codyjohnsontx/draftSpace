import { parseServerMessage, type ClientMessage, type ServerMessage } from "@draftspace/collaboration-protocol";

export interface CollaborationTransport {
  connect(url: string, handlers: { onOpen: () => void; onMessage: (message: ServerMessage) => void; onClose: () => void; onError: () => void }): void;
  send(message: ClientMessage): void;
  close(): void;
}

type SocketListeners = { open: () => void; message: (event: MessageEvent) => void; close: () => void; error: () => void };

export class WebSocketCollaborationTransport implements CollaborationTransport {
  private socket: WebSocket | null = null;
  private listeners: SocketListeners | null = null;
  connect(url: string, handlers: { onOpen: () => void; onMessage: (message: ServerMessage) => void; onClose: () => void; onError: () => void }) {
    this.close();
    const socket = new WebSocket(url); this.socket = socket;
    const listeners: SocketListeners = {
      open: handlers.onOpen,
      message: (event) => {
        try {
          const message = parseServerMessage(JSON.parse(String(event.data)));
          if (message) handlers.onMessage(message); else handlers.onError();
        } catch { handlers.onError(); }
      },
      close: handlers.onClose,
      error: handlers.onError,
    };
    this.listeners = listeners;
    socket.addEventListener("open", listeners.open);
    socket.addEventListener("message", listeners.message);
    socket.addEventListener("close", listeners.close);
    socket.addEventListener("error", listeners.error);
  }
  send(message: ClientMessage) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  close() {
    // Detach before closing so the replaced socket's late close/error events cannot fire stale reconnect logic.
    if (this.socket && this.listeners) {
      this.socket.removeEventListener("open", this.listeners.open);
      this.socket.removeEventListener("message", this.listeners.message);
      this.socket.removeEventListener("close", this.listeners.close);
      this.socket.removeEventListener("error", this.listeners.error);
    }
    this.socket?.close();
    this.socket = null;
    this.listeners = null;
  }
}
