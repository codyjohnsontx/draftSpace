import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { setLocalCommandAuthorizationProvider } from "@/core/commands/board-command";
import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";

/** A board holding one rectangle, with that rectangle selected. */
function selectedShape() {
  useBoardStore.getState().setBoard(createBoard());
  const id = useBoardStore.getState().createShape("rectangle", { x: 0, y: 0, width: 100, height: 60 })!;
  useSessionStore.getState().setSelected([id]);
  return id;
}

const pressDuplicate = () => fireEvent.keyDown(window, { key: "d", metaKey: true });

afterEach(() => {
  setLocalCommandAuthorizationProvider(() => true);
  useSessionStore.getState().setSelected([]);
  useBoardStore.setState({ board: null });
});

describe("duplicating from the keyboard", () => {
  it("selects the copies it made", () => {
    const id = selectedShape();
    render(<CanvasWorkspace />);

    pressDuplicate();

    const selected = useSessionStore.getState().selectedIds;
    expect(selected).toHaveLength(1);
    expect(selected[0]).not.toBe(id);
    expect(useBoardStore.getState().board?.elementIds).toHaveLength(2);
  });

  it("leaves the selection alone when there is no board to duplicate from", () => {
    const id = "an-id-from-a-board-that-closed";
    useBoardStore.setState({ board: null });
    useSessionStore.getState().setSelected([id]);
    render(<CanvasWorkspace />);

    pressDuplicate();

    expect(useSessionStore.getState().selectedIds).toEqual([id]);
    expect(useBoardStore.getState().board).toBeNull();
  });

  it("leaves the selection alone when the duplicate is refused", () => {
    const id = selectedShape();
    render(<CanvasWorkspace />);
    setLocalCommandAuthorizationProvider(() => false);

    pressDuplicate();

    expect(useSessionStore.getState().selectedIds).toEqual([id]);
    expect(useBoardStore.getState().board?.elementIds).toEqual([id]);
  });
});
