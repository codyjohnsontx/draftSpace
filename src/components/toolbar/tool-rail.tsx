"use client";

import { Fragment } from "react";
import { Circle, Diamond, Hand, LockKeyhole, MousePointer2, Square } from "lucide-react";
import { useSessionStore, type Tool } from "@/stores/session-store";
import { Tooltip } from "@/components/ui/tooltip";
import { useCollaborationStore } from "@/stores/collaboration-store";

const tools: { id: Tool; label: string; description: string; key: string; icon: typeof Hand }[] = [
  { id: "select", label: "Select", description: "Select, move, and resize objects", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", description: "Pan around the canvas", key: "H", icon: Hand },
  { id: "rectangle", label: "Rectangle", description: "Draw a rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Ellipse", description: "Draw an ellipse", key: "E", icon: Circle },
  { id: "diamond", label: "Diamond", description: "Draw a diamond", key: "D", icon: Diamond },
];

export function ToolRail() {
  const active = useSessionStore((s) => s.activeTool); const setTool = useSessionStore((s) => s.setTool);
  const collaborationMode = useCollaborationStore((s) => s.mode); const collaborationStatus = useCollaborationStore((s) => s.status); const role = useCollaborationStore((s) => s.role); const readOnly = collaborationMode === "guest" && (collaborationStatus !== "connected" || role !== "editor");
  return <nav className="tool-rail" aria-label="Drawing tools">{tools.map(({ id, label, description, key, icon: Icon }, index) => {
    return <Fragment key={id}>{index === 2 && <span className="divider vertical" />}<Tooltip label={label} description={description} shortcut={key}>{(tooltipId) =>
      <button type="button" className={active === id ? "tool active" : "tool"} aria-label={label} aria-pressed={active === id} aria-describedby={tooltipId} disabled={readOnly && id !== "select" && id !== "hand"} onClick={() => setTool(id)}><Icon size={19} /><span>{key}</span><b className="sr-only">{label}</b></button>}
    </Tooltip></Fragment>;
  })}
    <span className="divider vertical" />
    <Tooltip label="Tool lock" description="Keep a drawing tool active — coming soon">{(tooltipId) => <button type="button" className="tool" aria-label="Tool lock" aria-describedby={tooltipId}><LockKeyhole size={18} /></button>}</Tooltip>
  </nav>;
}
