import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BoardRecoveryScreen } from "@/components/recovery/board-recovery-screen";
import { PersistenceStatus } from "@/components/app-shell/persistence-status";
import { usePersistenceStore, type RecoveryPayload } from "@/stores/persistence-store";
import type { PersistenceController } from "@/hooks/use-board-persistence";
import { persistenceError } from "@/features/persistence/persistence-errors";

const controller = (): PersistenceController => ({ retrySave: vi.fn(), retryStorage: vi.fn(), startNewBoard: vi.fn(), downloadRecovery: vi.fn(), downloadCurrentBackup: vi.fn() });
const recovery: RecoveryPayload = { boardId: "broken", raw: { bad: true }, detectedAt: new Date().toISOString(), reason: "invalid", issues: ["name: Required"] };

beforeEach(() => usePersistenceStore.setState({ status: "saved", error: null, recovery: null, networkOnline: true, savedRevision: 0, attemptedRevision: null, lastSavedAt: null }));

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
  it("renders saved state as non-actionable status", () => { render(<PersistenceStatus controller={controller()} />); expect(screen.queryByRole("button", { name: "Saved locally" })).not.toBeInTheDocument(); expect(screen.getByText("Saved locally")).toBeVisible(); });
  it("describes a successful local save while offline", () => { usePersistenceStore.setState({ status: "saved", networkOnline: false }); render(<PersistenceStatus controller={controller()} />); expect(screen.getByText("Saved offline")).toBeVisible(); });
});
