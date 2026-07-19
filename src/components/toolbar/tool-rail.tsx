"use client";

import { Hand, LockKeyhole, MousePointer2, Square } from "lucide-react";
import { useSessionStore, type Tool } from "@/stores/session-store";
import { Tooltip } from "@/components/ui/tooltip";

const tools: { id: Tool; label: string; description: string; key: string; icon: typeof Hand }[] = [
  { id: "select", label: "Select", description: "Select, move, and resize objects", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", description: "Pan around the canvas", key: "H", icon: Hand },
  { id: "rectangle", label: "Rectangle", description: "Draw a rectangle", key: "R", icon: Square },
];

export function ToolRail() {
  const active = useSessionStore((s) => s.activeTool); const setTool = useSessionStore((s) => s.setTool);
  return <nav className="tool-rail" aria-label="Drawing tools">{tools.map(({ id, label, description, key, icon: Icon }) => {
    return <Tooltip key={id} label={label} description={description} shortcut={key}>{(tooltipId) =>
      <button type="button" className={active === id ? "tool active" : "tool"} aria-label={label} aria-pressed={active === id} aria-describedby={tooltipId} onClick={() => setTool(id)}><Icon size={19} /><span>{key}</span><b className="sr-only">{label}</b></button>}
    </Tooltip>;
  })}
    <span className="divider vertical" />
    <Tooltip label="Tool lock" description="Keep a drawing tool active — coming soon">{(tooltipId) => <button type="button" className="tool" aria-label="Tool lock" aria-describedby={tooltipId}><LockKeyhole size={18} /></button>}</Tooltip>
  </nav>;
}
