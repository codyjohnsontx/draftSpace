"use client";

import { Hand, LockKeyhole, MousePointer2, Square } from "lucide-react";
import { useSessionStore, type Tool } from "@/stores/session-store";

const tools: { id: Tool; label: string; key: string; icon: typeof Hand }[] = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", key: "H", icon: Hand },
  { id: "rectangle", label: "Rectangle", key: "R", icon: Square },
];

export function ToolRail() {
  const active = useSessionStore((s) => s.activeTool); const setTool = useSessionStore((s) => s.setTool);
  return <nav className="tool-rail" aria-label="Drawing tools">{tools.map(({ id, label, key, icon: Icon }) =>
    <button key={id} className={active === id ? "tool active" : "tool"} aria-pressed={active === id} onClick={() => setTool(id)} title={`${label} (${key})`}><Icon size={19} /><span>{key}</span><b className="sr-only">{label}</b></button>)}
    <span className="divider vertical" /><button className="tool" title="Keep tool active (coming soon)" aria-label="Tool lock"><LockKeyhole size={18} /></button>
  </nav>;
}
