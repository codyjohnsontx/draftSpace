"use client";

import { LogOut, Radio, Users } from "lucide-react";
import { collaborationController } from "@/features/collaboration/collaboration-controller";
import { useCollaborationStore } from "@/stores/collaboration-store";

export function LiveRoomStatus() {
  const role = useCollaborationStore((state) => state.role); const participants = useCollaborationStore((state) => state.participants);
  return <div className="live-room-status"><Radio size={14} /><span>Live · {role === "editor" ? "Editing" : "Viewing"}</span><i /><Users size={14} /><b>{Object.keys(participants).length + 1}</b><button type="button" aria-label="Leave live room" onClick={() => { collaborationController.leave(true); window.location.assign("/"); }}><LogOut size={14} /></button></div>;
}
