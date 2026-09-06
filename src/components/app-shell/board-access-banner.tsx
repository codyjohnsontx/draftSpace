"use client";

import { useEffect, useState } from "react";
import { Eye, PencilLine, Radio } from "lucide-react";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { usePersistenceStore } from "@/stores/persistence-store";

const TAKEOVER_NOTICE_MS = 6000;
const ROOM_CLOSED_NOTICE_MS = 6000;

/**
 * Says out loud why a tab cannot be edited. A canvas that quietly swallows input is worse
 * than the overwriting it replaced, so the reason is on screen the whole time this tab is
 * read-only, and the handover is announced when it arrives.
 */
export function BoardAccessBanner() {
  const readOnly = usePersistenceStore((state) => state.boardAccess === "read-only");
  const [tookOver, setTookOver] = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = usePersistenceStore.subscribe((state, previous) => {
      // Only the promotion path raises this. A read-only tab that claims a board the user picked
      // from the switcher, starts a new one, or falls back to a session-only draft makes the very
      // same read-only to owner move without another tab having done anything.
      if (state.takenOverBoardId === previous.takenOverBoardId) return;
      clearTimeout(timer);
      if (state.takenOverBoardId === null) { setTookOver(false); return; }
      setTookOver(true);
      timer = setTimeout(() => setTookOver(false), TAKEOVER_NOTICE_MS);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Ending the room resets the collaboration store, so that a room was live is readable only
    // at the transition itself. Anything that asks afterwards is asking a store that has already
    // forgotten, which is the same as not telling the host at all.
    const unsubscribe = useCollaborationStore.subscribe((state, previous) => {
      if (!state.hostingEndedByClaimLoss || state.hostingEndedByClaimLoss === previous.hostingEndedByClaimLoss) return;
      clearTimeout(timer);
      setRoomClosed(true);
      timer = setTimeout(() => setRoomClosed(false), ROOM_CLOSED_NOTICE_MS);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);

  if (readOnly) return <div className="board-access-banner" role="status">
    <Eye size={14} />
    <span><strong>View only.</strong> Another tab is editing this board, so this one cannot change it. Close that tab and this one takes over.{roomClosed && " The live room it was hosting closed, and the people in it were disconnected."}</span>
  </div>;

  if (roomClosed) return <div className="board-access-banner" role="status">
    <Radio size={14} />
    <span><strong>Live room closed.</strong> This tab stopped editing the board it was hosting, so the room ended and the people in it were disconnected.</span>
  </div>;

  if (tookOver) return <div className="board-access-banner took-over" role="status">
    <PencilLine size={14} />
    <span><strong>You can edit again.</strong> The other tab let this board go, so its latest work is open here.</span>
  </div>;

  return null;
}
