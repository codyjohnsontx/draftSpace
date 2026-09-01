import { afterEach, describe, expect, it } from "vitest";
import { canEditBoard } from "@/hooks/use-can-edit-board";
import { usePersistenceStore } from "@/stores/persistence-store";
import { useCollaborationStore } from "@/stores/collaboration-store";

afterEach(() => usePersistenceStore.setState({ boardAccess: "owner" }));

/**
 * Edit rights are never wider than the claim actually held, and a handover is the moment
 * that is easiest to get wrong: `claimBoard` releases the outgoing lease before it acquires
 * the next, so for the length of that await the tab holds nothing at all. Access reports
 * `pending` there rather than staying `owner`, and nothing may write during it.
 */
describe("board access gate", () => {
  it("refuses edits while a claim is being handed over", () => {
    usePersistenceStore.setState({ boardAccess: "owner" });
    expect(canEditBoard()).toBe(true);
    usePersistenceStore.setState({ boardAccess: "pending" });
    expect(canEditBoard()).toBe(false);
    usePersistenceStore.setState({ boardAccess: "read-only" });
    expect(canEditBoard()).toBe(false);
  });

  // That a handover is not shown as another tab's read-only view is decided by the banner and the
  // save status, not here, so it is pinned where they are rendered: see "board access presentation"
  // in tests/unit/persistence-ui.test.tsx.

  it("still refuses a live-room viewer that holds the claim", () => {
    useCollaborationStore.setState({ mode: "guest", status: "connected", role: "viewer" });
    usePersistenceStore.setState({ boardAccess: "owner" });
    expect(canEditBoard()).toBe(false);
    useCollaborationStore.setState({ mode: "local", status: "idle", role: "editor" });
  });
});
