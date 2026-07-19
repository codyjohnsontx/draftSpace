"use client";

import { Focus, Grid2X2, Magnet, Minus, Plus } from "lucide-react";
import { selectionBounds } from "@/core/geometry/bounds";
import { useBoardStore } from "@/stores/board-store";
import { useViewportStore } from "@/stores/viewport-store";
import { Tooltip } from "@/components/ui/tooltip";

export function ViewportControls({ size }: { size: { width: number; height: number } }) {
  const viewport = useViewportStore((s) => s.viewport); const board = useBoardStore((s) => s.board);
  const center = { x: size.width / 2, y: size.height / 2 };
  const pattern = board?.preferences.backgroundPattern ?? "none";
  return <div className="viewport-controls" aria-label="Canvas view controls">
    <Tooltip label="Zoom out" description="See more of the board" align="start">{(tooltipId) => <button type="button" onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom / 1.15)} aria-label="Zoom out" aria-describedby={tooltipId}><Minus size={16} /></button>}</Tooltip>
    <Tooltip label="Reset view" description="Return to 100% zoom and the board origin">{(tooltipId) => <button type="button" className="zoom-label" onClick={() => useViewportStore.getState().reset()} aria-label="Reset zoom to 100%" aria-describedby={tooltipId}>{Math.round(viewport.zoom * 100)}%</button>}</Tooltip>
    <Tooltip label="Zoom in" description="Get a closer view">{(tooltipId) => <button type="button" onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom * 1.15)} aria-label="Zoom in" aria-describedby={tooltipId}><Plus size={16} /></button>}</Tooltip>
    <span className="divider vertical" />
    <Tooltip label="Zoom to fit" description="Fit every object in the viewport">{(tooltipId) => <button type="button" onClick={() => { if (!board) return; useViewportStore.getState().fit(selectionBounds(board.elementIds.map((id) => board.elements[id])), size); }} aria-label="Zoom to fit" aria-describedby={tooltipId}><Focus size={16} /></button>}</Tooltip>
    <Tooltip label="Background" description={`Current: ${pattern}. Cycle dots, grid, and plain`} >{(tooltipId) => <button type="button" onClick={() => { if (!board) return; useBoardStore.getState().commit("Toggle background", (b) => { b.preferences.backgroundPattern = b.preferences.backgroundPattern === "dots" ? "grid" : b.preferences.backgroundPattern === "grid" ? "none" : "dots"; }); }} aria-label="Change background pattern" aria-describedby={tooltipId}><Grid2X2 size={16} /></button>}</Tooltip>
    <Tooltip label="Snap to grid" description={board?.preferences.snapToGrid ? "On — Click to allow free placement" : "Off — Click to align objects to the grid"}>{(tooltipId) => <button type="button" className={board?.preferences.snapToGrid ? "enabled" : ""} onClick={() => { if (!board) return; useBoardStore.getState().commit("Toggle grid snapping", (b) => { b.preferences.snapToGrid = !b.preferences.snapToGrid; }); }} aria-pressed={board?.preferences.snapToGrid} aria-label="Snap to grid" aria-describedby={tooltipId}><Magnet size={16} /></button>}</Tooltip>
  </div>;
}
