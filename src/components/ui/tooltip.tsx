"use client";

import { useId, type ReactNode } from "react";

type TooltipProps = {
  label: string;
  description: string;
  shortcut?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
  children: (tooltipId: string) => ReactNode;
};

export function Tooltip({ label, description, shortcut, side = "top", align = "center", className = "", children }: TooltipProps) {
  const tooltipId = useId();
  return <span className={`tooltip-anchor ${className}`.trim()} data-side={side} data-align={align}>
    {children(tooltipId)}
    <span className="app-tooltip" id={tooltipId} role="tooltip">
      <span className="app-tooltip-copy"><strong>{label}</strong><small>{description}</small></span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </span>
  </span>;
}
