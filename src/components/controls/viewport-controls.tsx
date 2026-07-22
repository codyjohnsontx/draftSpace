"use client";

import { Focus, Grid2X2, Magnet, Minus, Plus } from "lucide-react";
import { selectionBounds } from "@/core/geometry/bounds";
import { useBoardStore } from "@/stores/board-store";
import { useViewportStore } from "@/stores/viewport-store";
import { Tooltip } from "@/components/ui/tooltip";
import { useCollaborationStore } from "@/stores/collaboration-store";

export function ViewportControls({ size }: { size: { width: number; height: number } }) {
  const viewport = useViewportStore((s) => s.viewport); const board = useBoardStore((s) => s.board);
  const collaborationMode = useCollaborationStore((s) => s.mode); const collaborationStatus = useCollaborationStore((s) => s.status); const collaborationRole = useCollaborationStore((s) => s.role);
  const readOnly = collaborationMode === "guest" && (collaborationStatus !== "connected" || collaborationRole !== "editor");
  const center = { x: size.width / 2, y: size.height / 2 };
  const pattern = board?.preferences.backgroundPattern ?? "none";
  return <div className="viewport-controls" aria-label="Canvas view controls">
    <Tooltip label="Zoom out" description="See more of the board" align="start">{(tooltipId) => <button type="button" onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom / 1.15)} aria-label="Zoom out" aria-describedby={tooltipId}><Minus size={16} /></button>}</Tooltip>
    <Tooltip label="Reset view" description="Return to 100% zoom and the board origin">{(tooltipId) => <button type="button" className="zoom-label" onClick={() => useViewportStore.getState().reset()} aria-label="Reset zoom to 100%" aria-describedby={tooltipId}>{Math.round(viewport.zoom * 100)}%</button>}</Tooltip>
    <Tooltip label="Zoom in" description="Get a closer view">{(tooltipId) => <button type="button" onClick={() => useViewportStore.getState().zoomAt(center, viewport.zoom * 1.15)} aria-label="Zoom in" aria-describedby={tooltipId}><Plus size={16} /></button>}</Tooltip>
    <span className="divider vertical" />
    <Tooltip label="Zoom to fit" description="Fit every object in the viewport">{(tooltipId) => <button type="button" onClick={() => { if (!board) return; useViewportStore.getState().fit(selectionBounds(board.elementIds.map((id) => board.elements[id])), size); }} aria-label="Zoom to fit" aria-describedby={tooltipId}><Focus size={16} /></button>}</Tooltip>
    <Tooltip label="Background" description={`Current: ${pattern}. Cycle dots, grid, and plain`} >{(tooltipId) => <button type="button" disabled={readOnly} onClick={() => { if (!board) return; const backgroundPattern = board.preferences.backgroundPattern === "dots" ? "grid" : board.preferences.backgroundPattern === "grid" ? "none" : "dots"; useBoardStore.getState().updateBoard({ preferences: { backgroundPattern } }, "Toggle background"); }} aria-label="Change background pattern" aria-describedby={tooltipId}><Grid2X2 size={16} /></button>}</Tooltip>
    <Tooltip label="Snap to grid" description={board?.preferences.snapToGrid ? "On — Click to allow free placement" : "Off — Click to align objects to the grid"}>{(tooltipId) => <button type="button" disabled={readOnly} className={board?.preferences.snapToGrid ? "enabled" : ""} onClick={() => { if (!board) return; useBoardStore.getState().updateBoard({ preferences: { snapToGrid: !board.preferences.snapToGrid } }, "Toggle grid snapping"); }} aria-pressed={board?.preferences.snapToGrid} aria-label="Snap to grid" aria-describedby={tooltipId}><Magnet size={16} /></button>}</Tooltip>
  </div>;
}
