"use client";

import { useCollaborationStore } from "@/stores/collaboration-store";
import { usePersistenceStore } from "@/stores/persistence-store";

type LiveRoomSeat = Pick<ReturnType<typeof useCollaborationStore.getState>, "mode" | "status" | "role">;

/** Guests may only edit once the host admits them as an editor. */
const liveRoomAllowsEditing = (state: LiveRoomSeat) =>
  state.mode !== "guest" || (state.status === "connected" && state.role === "editor");

/**
 * Whether this tab may change the board: it has to hold the board's lease, and if it is a
 * guest in a live room it has to have been admitted as an editor. Every control that
 * mutates the document reads this, and `dispatchCommand` enforces the same two conditions.
 */
export const canEditBoard = () =>
  liveRoomAllowsEditing(useCollaborationStore.getState()) && usePersistenceStore.getState().boardAccess === "owner";

export function useCanEditBoard(): boolean {
  const liveRoomAllows = useCollaborationStore(liveRoomAllowsEditing);
  const ownsBoard = usePersistenceStore((state) => state.boardAccess === "owner");
  return liveRoomAllows && ownsBoard;
}
