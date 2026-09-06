import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBar } from "@/components/app-shell/top-bar";
import { createBoard } from "@/core/board/factory";
import { useBoardStore } from "@/stores/board-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

// Live rooms are behind a flag that is off outside development; this file is about the control
// itself, so it is rendered as a session with rooms available would see it.
vi.mock("@/features/collaboration/collaboration-enabled", () => ({ collaborationEnabled: true }));

const controller = (): PersistenceController => ({ retrySave: vi.fn(), retryStorage: vi.fn(), startNewBoard: vi.fn(), openBoard: vi.fn().mockResolvedValue("opened"), downloadRecovery: vi.fn(), downloadCurrentBackup: vi.fn() });

beforeEach(() => useBoardStore.getState().setBoard(createBoard("Payments architecture")));
afterEach(() => { useCollaborationStore.getState().reset(); usePersistenceStore.setState({ boardAccess: "owner" }); });

/**
 * A room hosted from a tab that cannot edit the board saves nothing, so the control that starts
 * one is closed off with the board name beside it rather than left live. The refusal itself is
 * `startHost`'s (see tests/unit/collaboration-host-ownership.test.ts); this is only about a user
 * never reaching a refusal they cannot understand.
 */
describe("who is offered the share control", () => {
  it("offers it to the tab that holds the board", () => {
    render(<TopBar persistence={controller()} />);
    expect(screen.getByRole("button", { name: "Share board" })).toBeEnabled();
  });

  it("closes it off, and says why, while another tab is editing the board", () => {
    usePersistenceStore.setState({ boardAccess: "read-only" });
    render(<TopBar persistence={controller()} />);

    const share = screen.getByRole("button", { name: "Share board" });
    expect(share).toBeDisabled();
    // The same explanation the board name and the view-only banner give, on the control itself.
    expect(share).toHaveAccessibleDescription("Only the tab editing this board can share it");
    expect(screen.getByRole("textbox", { name: "Board name" })).toBeDisabled();
  });

  it("closes it off while a claim is being handed over", () => {
    usePersistenceStore.setState({ boardAccess: "pending" });
    render(<TopBar persistence={controller()} />);
    expect(screen.getByRole("button", { name: "Share board" })).toBeDisabled();
  });
});
