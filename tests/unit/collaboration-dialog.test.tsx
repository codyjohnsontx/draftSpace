import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ShareRoomDialog } from "@/components/collaboration/share-room-dialog";
import { useCollaborationStore } from "@/stores/collaboration-store";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  return <><button ref={openerRef} type="button" onClick={() => setOpen(true)}>Share board</button>{open && <ShareRoomDialog onClose={() => setOpen(false)} returnFocusRef={openerRef} />}</>;
}

afterEach(() => useCollaborationStore.getState().reset());

describe("share room dialog", () => {
  it("traps keyboard focus, closes on Escape, and restores the opener", async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Share board" });
    opener.focus();
    fireEvent.click(opener);

    const close = screen.getByRole("button", { name: "Close share dialog" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("textbox", { name: "Your display name" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Share this board" })).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
