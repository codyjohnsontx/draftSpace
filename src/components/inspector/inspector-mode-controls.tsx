"use client";

import { Check, EyeOff, PanelRight, PanelTop } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { InspectorMode } from "@/stores/ui-preferences-store";

const modes: { mode: InspectorMode; label: string; description: string; icon: typeof PanelTop }[] = [
  { mode: "floating", label: "Floating", description: "Show a compact style bar above the canvas tools", icon: PanelTop },
  { mode: "sidebar", label: "Right sidebar", description: "Dock the style inspector to the right", icon: PanelRight },
  { mode: "hidden", label: "Hidden", description: "Hide the style inspector", icon: EyeOff },
];

export function InspectorModeControls({ mode, onSelect, presentation = "header" }: {
  mode: InspectorMode;
  onSelect: (mode: InspectorMode) => void;
  presentation?: "header" | "menu";
}) {
  if (presentation === "menu") return <div className="inspector-mode-menu-options">
    {modes.map(({ mode: option, label, description, icon: Icon }) => <button key={option} type="button" role="menuitemradio" aria-checked={mode === option} className="inspector-mode-option" onClick={() => onSelect(option)}>
      <Icon size={17} aria-hidden="true" />
      <span><strong>{label}</strong><small>{description}</small></span>
      {mode === option && <Check size={16} className="mode-check" aria-hidden="true" />}
    </button>)}
  </div>;

  return <div className="inspector-mode-buttons" aria-label="Inspector layout">
    {modes.map(({ mode: option, label, description, icon: Icon }) => <Tooltip key={option} side="top" align="end" label={label} description={description}>{(descriptionId) =>
      <button type="button" className="inspector-mode-button" aria-label={`${label} inspector`} aria-describedby={descriptionId} aria-pressed={mode === option} onClick={() => onSelect(option)}><Icon size={16} /></button>}
    </Tooltip>)}
  </div>;
}
