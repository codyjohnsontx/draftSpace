import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BoardRecoveryScreen } from "@/components/recovery/board-recovery-screen";
import { BoardAccessBanner } from "@/components/app-shell/board-access-banner";
import { PersistenceStatus } from "@/components/app-shell/persistence-status";
import { usePersistenceStore, type RecoveryPayload } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import { persistenceError } from "@/features/persistence/persistence-errors";

const controller = (): PersistenceController => ({ retrySave: vi.fn(), retryStorage: vi.fn(), startNewBoard: vi.fn(), openBoard: vi.fn().mockResolvedValue("opened"), downloadRecovery: vi.fn(), downloadCurrentBackup: vi.fn() });
const recovery: RecoveryPayload = { boardId: "broken", raw: { bad: true }, detectedAt: new Date().toISOString(), reason: "invalid", issues: ["name: Required"] };

beforeEach(() => usePersistenceStore.setState({ status: "saved", boardAccess: "owner", error: null, notice: null, takenOverBoardId: null, recovery: null, networkOnline: true, savedRevision: 0, attemptedRevision: null, lastSavedAt: null }));

describe("persistence UI", () => {
  it("shows focused recovery actions and preserves the start-new intent", async () => {
    const actions = controller(); render(<BoardRecoveryScreen recovery={recovery} controller={actions} />);
    const download = screen.getByRole("button", { name: "Download raw data" }); await waitFor(() => expect(download).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Start a new board" })); expect(actions.startNewBoard).toHaveBeenCalledOnce();
  });
  it("shows version-specific recovery copy", () => {
    render(<BoardRecoveryScreen recovery={{ ...recovery, reason: "unsupported-version", schemaVersion: 8 }} controller={controller()} />);
    expect(screen.getByText("Unsupported newer version")).toBeVisible(); expect(screen.getByText(/schema version 8/)).toBeVisible();
  });
  it("opens a save retry dialog", () => {
    const actions = controller(); usePersistenceStore.setState({ status: "failed", error: persistenceError("write-failed", "Could not write.", true) }); render(<PersistenceStatus controller={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Save failed" })); expect(screen.getByRole("dialog", { name: "Save problem" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry save" })); expect(actions.retrySave).toHaveBeenCalledOnce();
  });
  it("closes an action panel with Escape and restores focus", () => {
    usePersistenceStore.setState({ status: "failed", error: persistenceError("write-failed", "Could not write.", true) }); render(<PersistenceStatus controller={controller()} />);
    const trigger = screen.getByRole("button", { name: "Save failed" }); fireEvent.click(trigger); fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Save problem" })).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it("offers storage retry in session-only mode", () => {
    usePersistenceStore.setState({ status: "session-only", error: persistenceError("storage-unavailable", "No storage.", true) }); render(<PersistenceStatus controller={controller()} />);
    fireEvent.click(screen.getByRole("button", { name: "Not saving" })); expect(screen.getByRole("button", { name: "Retry storage" })).toBeVisible();
  });
  it("names the other tab when a session-only draft cannot be saved over it", () => {
    usePersistenceStore.setState({ status: "session-only", error: persistenceError("board-claimed-elsewhere", "Another tab claimed this board while storage was unavailable.", true) });
    render(<PersistenceStatus controller={controller()} />);
    fireEvent.click(screen.getByRole("button", { name: "Not saving" }));
    expect(screen.getByRole("dialog", { name: "Another tab is editing this board" })).toBeVisible();
    expect(screen.queryByText(/Local storage is unavailable/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry storage" })).toBeVisible();
  });
  it("names the board a rescued draft was saved into", () => {
    usePersistenceStore.setState({ status: "saved", notice: persistenceError("board-saved-as-copy", 'Saved as "My first draft (recovered copy)".', false) });
    render(<PersistenceStatus controller={controller()} />);
    fireEvent.click(screen.getByRole("button", { name: "Saved as a copy" }));
    expect(screen.getByRole("dialog", { name: "Saved as a copy" })).toBeVisible();
    expect(screen.getByText('Saved as "My first draft (recovered copy)".')).toBeVisible();
  });
  it("keeps the copy notice through the saves that follow it", () => {
    // The notice used to live in `error`, which markSaving and markSaved both clear, so the
    // first autosave after the rescue took the explanation away. A pan is enough to cause one.
    usePersistenceStore.setState({ status: "saved", notice: persistenceError("board-saved-as-copy", 'Saved as "My first draft (recovered copy)".', false) });
    render(<PersistenceStatus controller={controller()} />);
    act(() => { usePersistenceStore.getState().markSaving(4); });
    act(() => { usePersistenceStore.getState().markSaved(4, new Date().toISOString()); });
    expect(screen.getByRole("button", { name: "Saved as a copy" })).toBeVisible();
  });
  it("retires the copy notice once another board is opened", () => {
    usePersistenceStore.setState({ status: "saved", notice: persistenceError("board-saved-as-copy", 'Saved as "My first draft (recovered copy)".', false) });
    render(<PersistenceStatus controller={controller()} />);
    act(() => { usePersistenceStore.getState().markLoading(); });
    expect(screen.queryByRole("button", { name: "Saved as a copy" })).not.toBeInTheDocument();
  });
  it("renders saved state as non-actionable status", () => { render(<PersistenceStatus controller={controller()} />); expect(screen.queryByRole("button", { name: "Saved locally" })).not.toBeInTheDocument(); expect(screen.getByText("Saved locally")).toBeVisible(); });
  it("describes a successful local save while offline", () => { usePersistenceStore.setState({ status: "saved", networkOnline: false }); render(<PersistenceStatus controller={controller()} />); expect(screen.getByText("Saved offline")).toBeVisible(); });
});

describe("board access banner", () => {
  it("says why this tab cannot edit, and announces the handover when it arrives", () => {
    usePersistenceStore.setState({ boardAccess: "read-only" });
    render(<BoardAccessBanner />);
    expect(screen.getByText(/Another tab is editing this board/)).toBeVisible();
    act(() => { usePersistenceStore.getState().markTakenOver("board-1"); });
    expect(screen.getByText(/The other tab let this board go/)).toBeVisible();
  });
  it("claims no handover when a read-only tab claims a board the user picked", () => {
    // Opening a board nobody holds, starting a new one, and falling back to a session-only draft
    // all move this tab from read-only to owner without another tab having done anything, so the
    // access transition alone cannot tell a promotion apart from a switch the user made.
    usePersistenceStore.setState({ boardAccess: "read-only" });
    render(<BoardAccessBanner />);
    act(() => { usePersistenceStore.getState().markLoading(); usePersistenceStore.getState().setBoardAccess("owner"); });
    expect(screen.queryByText(/The other tab let this board go/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Another tab is editing this board/)).not.toBeInTheDocument();
  });
  it("retires a handover notice as soon as the tab leaves the board it was about", () => {
    usePersistenceStore.setState({ boardAccess: "read-only" });
    render(<BoardAccessBanner />);
    act(() => { usePersistenceStore.getState().markTakenOver("board-1"); });
    act(() => { usePersistenceStore.getState().markLoading(); });
    expect(screen.queryByText(/The other tab let this board go/)).not.toBeInTheDocument();
  });
});

/**
 * Both surfaces key on "read-only" exactly, and widening either to "not owner" is the natural
 * mistake: `pending` is this tab between two leases of its own, so a user who simply picked
 * another board must not be told for that instant that someone else is editing it.
 */
describe("board access presentation", () => {
  it("says nothing about another tab while a claim is being handed over", () => {
    usePersistenceStore.setState({ boardAccess: "pending" });
    const { container } = render(<><PersistenceStatus controller={controller()} /><BoardAccessBanner /></>);
    expect(screen.queryByText("View only")).not.toBeInTheDocument();
    expect(container.querySelector(".board-access-banner")).toBeNull();
  });

  it("says View only and why once the board really is another tab's", () => {
    usePersistenceStore.setState({ boardAccess: "read-only" });
    const { container } = render(<><PersistenceStatus controller={controller()} /><BoardAccessBanner /></>);
    expect(screen.getByRole("button", { name: "View only" })).toBeVisible();
    expect(container.querySelector(".board-access-banner")).not.toBeNull();
    expect(screen.getByText(/Another tab is editing this board/)).toBeVisible();
  });
});
