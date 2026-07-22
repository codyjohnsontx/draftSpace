"use client";

import { Eye, EyeOff, Radio } from "lucide-react";
import { collaborationController } from "@/features/collaboration/collaboration-controller";
import { useCollaborationStore } from "@/stores/collaboration-store";

export function FollowHostBanner() {
  const participants = useCollaborationStore((state) => state.participants); const following = useCollaborationStore((state) => state.followingHost);
  const hostPresenting = Object.values(participants).some((participant) => participant.role === "host" && participant.presence?.presentingViewport);
  if (!hostPresenting && !following) return null;
  return <div className="follow-host-banner"><Radio size={14} /><span>{following ? "Following host" : "The host is presenting"}</span><button type="button" onClick={() => collaborationController.setFollowingHost(!following)}>{following ? <EyeOff size={14} /> : <Eye size={14} />}{following ? "Stop following" : "Follow host"}</button></div>;
}
