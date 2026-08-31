import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoardSwitcher } from "@/components/app-shell/board-switcher";
import { createBoard } from "@/core/board/factory";
import type { BoardSummary } from "@/core/board/types";
import { useBoardStore } from "@/stores/board-store";
import { usePersistenceStore } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";

const controller = (): PersistenceController => ({ retrySave: vi.fn(), retryStorage: vi.fn(), startNewBoard: vi.fn(), openBoard: vi.fn(), downloadRecovery: vi.fn(), downloadCurrentBackup: vi.fn() });

const open = createBoard("Payments architecture");
const summary = (id: string, name: string, elementCount = 0): BoardSummary => ({ id, name, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-02T10:00:00.000Z", elementCount });
const other = summary("recovered", "Recovered copy", 4);

beforeEach(() => {
  useBoardStore.getState().setBoard(open);
  usePersistenceStore.setState({ boards: [summary(open.id, open.name), other] });
});

describe("board switcher", () => {
  it("stays hidden until a second board exists", () => {
    usePersistenceStore.setState({ boards: [summary(open.id, open.name)] });
    const { rerender } = render(<BoardSwitcher controller={controller()} />);
    expect(screen.queryByRole("button", { name: "Open a board" })).not.toBeInTheDocument();
    usePersistenceStore.setState({ boards: [summary(open.id, open.name), other] });
    rerender(<BoardSwitcher controller={controller()} />);
    expect(screen.getByRole("button", { name: "Open a board" })).toBeVisible();
  });

  it("names every stored board and marks the open one", () => {
    render(<BoardSwitcher controller={controller()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    expect(screen.getByRole("menu", { name: "Boards in this browser" })).toBeVisible();
    expect(screen.getByRole("menuitemradio", { name: /Payments architecture/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /Recovered copy/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("menuitemradio", { name: /Recovered copy/ })).toHaveTextContent("4 elements");
  });

  it("opens the board that is picked and closes the menu", () => {
    const actions = controller(); render(<BoardSwitcher controller={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Recovered copy/ }));
    expect(actions.openBoard).toHaveBeenCalledExactlyOnceWith("recovered");
    expect(screen.queryByRole("menu", { name: "Boards in this browser" })).not.toBeInTheDocument();
  });

  it("does not reopen the board that is already showing", () => {
    const actions = controller(); render(<BoardSwitcher controller={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Payments architecture/ }));
    expect(actions.openBoard).not.toHaveBeenCalled();
  });

  it("closes with Escape and restores focus to the trigger", () => {
    render(<BoardSwitcher controller={controller()} />);
    const trigger = screen.getByRole("button", { name: "Open a board" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu", { name: "Boards in this browser" }), { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Boards in this browser" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("falls back to a readable name for an unnamed board", () => {
    usePersistenceStore.setState({ boards: [summary(open.id, open.name), summary("blank", "   ")] });
    render(<BoardSwitcher controller={controller()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a board" }));
    expect(screen.getByRole("menuitemradio", { name: /Untitled board/ })).toBeVisible();
  });
});
