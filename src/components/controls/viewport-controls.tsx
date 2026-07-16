"use client";

import { Focus, Grid2X2, Magnet, Minus, Plus } from "lucide-react";
import { selectionBounds } from "@/core/geometry/bounds";
import { useBoardStore } from "@/stores/board-store";
import { useViewportStore } from "@/stores/viewport-store";

export function ViewportControls({ size }: { size: { width: number; height: number } }) {
  const viewport = useViewportStore((s) => s.viewport); const board = useBoardStore((s) => s.board);
  const center = { x: size.width / 2, y: size.height / 2 };
  return <div className="viewport-controls" aria-label="Canvas view controls">
    <button onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom / 1.15)} aria-label="Zoom out" title="Zoom out"><Minus size={16} /></button>
    <button className="zoom-label" onClick={() => useViewportStore.getState().reset()} aria-label="Reset zoom to 100%">{Math.round(viewport.zoom * 100)}%</button>
    <button onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom * 1.15)} aria-label="Zoom in" title="Zoom in"><Plus size={16} /></button>
    <span className="divider vertical" />
    <button onClick={() => { if (!board) return; useViewportStore.getState().fit(selectionBounds(board.elementIds.map((id) => board.elements[id])), size); }} aria-label="Zoom to fit" title="Zoom to fit"><Focus size={16} /></button>
    <button onClick={() => { if (!board) return; useBoardStore.getState().commit("Toggle background", (b) => { b.preferences.backgroundPattern = b.preferences.backgroundPattern === "dots" ? "grid" : b.preferences.backgroundPattern === "grid" ? "none" : "dots"; }); }} aria-label="Change background pattern" title="Background pattern"><Grid2X2 size={16} /></button>
    <button className={board?.preferences.snapToGrid ? "enabled" : ""} onClick={() => { if (!board) return; useBoardStore.getState().commit("Toggle grid snapping", (b) => { b.preferences.snapToGrid = !b.preferences.snapToGrid; }); }} aria-pressed={board?.preferences.snapToGrid} aria-label="Snap to grid" title="Snap to grid"><Magnet size={16} /></button>
  </div>;
}
