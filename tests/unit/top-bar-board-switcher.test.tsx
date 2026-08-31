import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBar } from "@/components/app-shell/top-bar";
import { createBoard } from "@/core/board/factory";
import type { BoardSummary } from "@/core/board/types";
import { useBoardStore } from "@/stores/board-store";
import { useCollaborationStore, type CollaborationStatus } from "@/stores/collaboration-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

const controller = (): PersistenceController => ({ retrySave: vi.fn(), retryStorage: vi.fn(), startNewBoard: vi.fn(), openBoard: vi.fn().mockResolvedValue("opened"), downloadRecovery: vi.fn(), downloadCurrentBackup: vi.fn() });
const open = createBoard("Payments architecture");
const summary = (id: string, name: string): BoardSummary => ({ id, name, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-02T10:00:00.000Z", elementCount: 0 });

beforeEach(() => {
  useBoardStore.getState().setBoard(open);
  usePersistenceStore.setState({ boards: [summary(open.id, open.name), summary("recovered", "Recovered copy")] });
});

afterEach(() => useCollaborationStore.getState().reset());

describe("who is offered the board switcher", () => {
  it("offers it to an ordinary local session holding two boards", () => {
    render(<TopBar persistence={controller()} />);
    expect(screen.getByRole("button", { name: "Open a board" })).toBeVisible();
  });

  it.each<CollaborationStatus>(["creating", "connecting", "connected", "host-away"])("withholds it while a host's room is still live (%s)", (status) => {
    useCollaborationStore.getState().set({ mode: "host", status });
    render(<TopBar persistence={controller()} />);
    expect(screen.queryByRole("button", { name: "Open a board" })).not.toBeInTheDocument();
  });

  // A guest is in someone else's room; the local board list is not theirs to switch, and the
  // room is served from whatever board is open.
  it.each<CollaborationStatus>(["connecting", "connected", "host-away", "lobby"])("withholds it from a collaboration guest (%s)", (status) => {
    useCollaborationStore.getState().set({ mode: "guest", status });
    render(<TopBar persistence={controller()} />);
    expect(screen.queryByRole("button", { name: "Open a board" })).not.toBeInTheDocument();
  });

  it("offers it again once the room is over", () => {
    useCollaborationStore.getState().set({ mode: "host", status: "ended" });
    render(<TopBar persistence={controller()} />);
    expect(screen.getByRole("button", { name: "Open a board" })).toBeVisible();
  });
});
