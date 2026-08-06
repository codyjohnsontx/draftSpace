"use client";

import type { Bounds, Point } from "@/core/elements/types";
import type { Viewport } from "@/core/board/types";
import { worldToScreen } from "@/core/geometry/coordinates";
import type { ResizeHandle } from "@/stores/session-store";

/**
 * What the connector tool is showing: the anchor dots of whatever is under the
 * pointer or being wired, and the edge a drag is about to commit.
 */
export type ConnectOverlay = { ports: Array<{ key: string; point: Point; active: boolean }>; draft: Point[] | null };

/** A selected edge, routed exactly as it is drawn, so the halo can never promise a line the canvas does not have. */
export type ConnectorSelection = { id: string; points: Point[]; strokeWidth: number };

/** How much wider than its own ink a selected edge's halo reaches, in screen pixels. */
const SELECTION_HALO = 7;

/** How far clear of the ink the halo stops, in screen pixels - enough to leave the arrowhead's barbs alone. */
const INK_CLEARANCE = 3;

const handles: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" }, { id: "n", x: .5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" }, { id: "e", x: 1, y: .5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" }, { id: "s", x: .5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" }, { id: "w", x: 0, y: .5, cursor: "ew-resize" },
];

export function InteractionOverlay({ bounds, marquee, snapBounds, connect = null, connectors, viewport }: { bounds: Bounds | null; marquee: Bounds | null; snapBounds: Bounds | null; connect?: ConnectOverlay | null; connectors?: readonly ConnectorSelection[]; viewport: Viewport }) {
  const rect = (value: Bounds) => {
    const point = worldToScreen(value, viewport);
    return { x: point.x, y: point.y, width: value.width * viewport.zoom, height: value.height * viewport.zoom };
  };
  const screenPoints = (points: readonly Point[]) => points.map((point) => { const p = worldToScreen(point, viewport); return `${p.x},${p.y}`; }).join(" ");
  return <svg className="interaction-overlay" aria-hidden="true">
    {/* A selected edge is haloed rather than framed: it is a line, and a box around
        its elbows would claim area the edge does not occupy. The corridor the edge's
        own ink runs down is masked out of the halo, so the band flanks the line
        instead of washing over it - the edge keeps the color it was given. */}
    {connectors?.map(({ id, points, strokeWidth }) => {
      if (points.length < 2) return null;
      const drawn = screenPoints(points);
      const ink = strokeWidth * viewport.zoom;
      return <g key={id}>
        <mask id={`edge-halo-${id}`} maskUnits="userSpaceOnUse">
          <polyline className="halo-band" points={drawn} strokeWidth={ink + SELECTION_HALO * 2} stroke="#fff" />
          <polyline className="halo-band" points={drawn} strokeWidth={ink + INK_CLEARANCE * 2} stroke="#000" />
        </mask>
        <polyline data-selected-connector={id} className="connector-selection" mask={`url(#edge-halo-${id})`} points={drawn} strokeWidth={ink + SELECTION_HALO * 2} />
      </g>;
    })}
    {marquee && (() => { const b = rect(marquee); return <rect className="marquee" {...b} />; })()}
    {connect?.draft && connect.draft.length >= 2 && <polyline className="connector-draft" points={screenPoints(connect.draft)} />}
    {connect?.ports.map(({ key, point, active }) => { const p = worldToScreen(point, viewport); return <circle key={key} className={active ? "connector-port active" : "connector-port"} cx={p.x} cy={p.y} r={active ? 5.5 : 4} />; })}
    {snapBounds && (() => { const b = rect(snapBounds); return <rect className="snap-frame" {...b} />; })()}
    {bounds && (() => { const b = rect(bounds); return <g><rect className="selection-frame-contrast" {...b} /><rect className="selection-frame" {...b} />{handles.map((h) => <rect key={h.id} data-resize-handle={h.id} className="resize-handle" x={b.x + b.width * h.x - 5} y={b.y + b.height * h.y - 5} width="10" height="10" style={{ cursor: h.cursor }} />)}</g>; })()}
  </svg>;
}
