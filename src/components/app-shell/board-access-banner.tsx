"use client";

import { useEffect, useState } from "react";
import { Eye, PencilLine } from "lucide-react";
import { usePersistenceStore } from "@/stores/persistence-store";

const TAKEOVER_NOTICE_MS = 6000;

/**
 * Says out loud why a tab cannot be edited. A canvas that quietly swallows input is worse
 * than the overwriting it replaced, so the reason is on screen the whole time this tab is
 * read-only, and the handover is announced when it arrives.
 */
export function BoardAccessBanner() {
  const readOnly = usePersistenceStore((state) => state.boardAccess === "read-only");
  const [tookOver, setTookOver] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = usePersistenceStore.subscribe((state, previous) => {
      if (state.boardAccess !== "owner" || previous.boardAccess !== "read-only") return;
      setTookOver(true);
      clearTimeout(timer);
      timer = setTimeout(() => setTookOver(false), TAKEOVER_NOTICE_MS);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);

  if (readOnly) return <div className="board-access-banner" role="status">
    <Eye size={14} />
    <span><strong>View only.</strong> Another tab is editing this board, so this one cannot change it. Close that tab and this one takes over.</span>
  </div>;

  if (tookOver) return <div className="board-access-banner took-over" role="status">
    <PencilLine size={14} />
    <span><strong>You can edit again.</strong> The other tab let this board go, so its latest work is open here.</span>
  </div>;

  return null;
}
