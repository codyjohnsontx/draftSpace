"use client";

import type { Bounds } from "@/core/elements/types";
import type { Viewport } from "@/core/board/types";
import { worldToScreen } from "@/core/geometry/coordinates";
import type { ResizeHandle } from "@/stores/session-store";

const handles: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" }, { id: "n", x: .5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" }, { id: "e", x: 1, y: .5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" }, { id: "s", x: .5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" }, { id: "w", x: 0, y: .5, cursor: "ew-resize" },
];

export function InteractionOverlay({ bounds, marquee, snapBounds, viewport }: { bounds: Bounds | null; marquee: Bounds | null; snapBounds: Bounds | null; viewport: Viewport }) {
  const rect = (value: Bounds) => {
    const point = worldToScreen(value, viewport);
    return { x: point.x, y: point.y, width: value.width * viewport.zoom, height: value.height * viewport.zoom };
  };
  return <svg className="interaction-overlay" aria-hidden="true">
    {marquee && (() => { const b = rect(marquee); return <rect className="marquee" {...b} />; })()}
    {snapBounds && (() => { const b = rect(snapBounds); return <rect className="snap-frame" {...b} />; })()}
    {bounds && (() => { const b = rect(bounds); return <g><rect className="selection-frame-contrast" {...b} /><rect className="selection-frame" {...b} />{handles.map((h) => <rect key={h.id} data-resize-handle={h.id} className="resize-handle" x={b.x + b.width * h.x - 5} y={b.y + b.height * h.y - 5} width="10" height="10" style={{ cursor: h.cursor }} />)}</g>; })()}
  </svg>;
}
