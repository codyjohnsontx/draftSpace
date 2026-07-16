"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement, Point } from "@/core/elements/types";
import { containsBounds, containsPoint, creationBounds, normalizeBounds, selectionBounds } from "@/core/geometry/bounds";
import { screenToWorld } from "@/core/geometry/coordinates";
import { resizedBounds, scaleElements } from "@/core/geometry/resize";
import { copyElements, readElements } from "@/features/clipboard/clipboard";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore, type ResizeHandle } from "@/stores/session-store";
import { useViewportStore } from "@/stores/viewport-store";
import { SceneCanvas } from "./scene-canvas";
import { InteractionOverlay } from "./interaction-overlay";
import { ToolRail } from "@/components/toolbar/tool-rail";
import { ViewportControls } from "@/components/controls/viewport-controls";

type Gesture =
  | { type: "pan"; pointerId: number; start: Point; viewport: Viewport }
  | { type: "draw"; pointerId: number; origin: Point; current: Point; square: boolean; fromCenter: boolean }
  | { type: "marquee"; pointerId: number; origin: Point; current: Point; additive: boolean }
  | { type: "move"; pointerId: number; origin: Point; current: Point; initial: CanvasElement[] }
  | { type: "resize"; pointerId: number; origin: Point; current: Point; handle: ResizeHandle; initialBounds: Bounds; initial: CanvasElement[] }
  | null;

export function CanvasWorkspace() {
  const board = useBoardStore((s) => s.board); const viewport = useViewportStore((s) => s.viewport);
  const selectedIds = useSessionStore((s) => s.selectedIds); const activeTool = useSessionStore((s) => s.activeTool); const spaceHeld = useSessionStore((s) => s.spaceHeld);
  const rootRef = useRef<HTMLDivElement>(null); const [gesture, setGesture] = useState<Gesture>(null); const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = rootRef.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(node); return () => observer.disconnect();
  }, []);

  const localPoint = useCallback((event: { clientX: number; clientY: number }) => { const rect = rootRef.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }, []);
  const worldPoint = useCallback((event: { clientX: number; clientY: number }) => screenToWorld(localPoint(event), useViewportStore.getState().viewport), [localPoint]);
  const ordered = useMemo(() => board ? board.elementIds.map((id) => board.elements[id]).filter(Boolean) : [], [board]);

  const displayed = useMemo(() => {
    const current = gesture; if (!current || (current.type !== "move" && current.type !== "resize")) return ordered;
    let changed: CanvasElement[];
    if (current.type === "move") { const dx = current.current.x - current.origin.x, dy = current.current.y - current.origin.y; changed = current.initial.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })); }
    else { const next = resizedBounds(current.initialBounds, current.handle, { x: current.current.x - current.origin.x, y: current.current.y - current.origin.y }); changed = scaleElements(current.initial, current.initialBounds, next); }
    const map = new Map(changed.map((e) => [e.id, e])); return ordered.map((e) => map.get(e.id) ?? e);
  }, [ordered, gesture]);

  const selectedElements = displayed.filter((e) => selectedIds.includes(e.id));
  const selectedBounds = selectionBounds(selectedElements);
  const current = gesture;
  const draft = current?.type === "draw" ? creationBounds(current.origin, current.current, current.square, current.fromCenter) : null;
  const marquee = current?.type === "marquee" ? normalizeBounds(current.origin, current.current) : null;

  const hitElement = (point: Point) => [...ordered].reverse().find((e) => !e.hidden && !e.locked && containsPoint(e, point, 6 / viewport.zoom));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!board || event.button === 2) return;
    const screen = localPoint(event); const world = worldPoint(event); const target = event.target as SVGElement;
    const handle = target.dataset.resizeHandle as ResizeHandle | undefined;
    rootRef.current?.setPointerCapture(event.pointerId);
    if (event.button === 1 || activeTool === "hand" || spaceHeld) setGesture({ type: "pan", pointerId: event.pointerId, start: screen, viewport });
    else if (handle && selectedBounds) setGesture({ type: "resize", pointerId: event.pointerId, origin: world, current: world, handle, initialBounds: selectedBounds, initial: selectedElements });
    else if (activeTool === "rectangle") setGesture({ type: "draw", pointerId: event.pointerId, origin: world, current: world, square: event.shiftKey, fromCenter: event.altKey });
    else {
      const hit = hitElement(world);
      if (hit) {
        if (event.shiftKey) { useSessionStore.getState().toggleSelected(hit.id); return; }
        const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id]; useSessionStore.getState().setSelected(ids);
        setGesture({ type: "move", pointerId: event.pointerId, origin: world, current: world, initial: ordered.filter((e) => ids.includes(e.id)) });
      } else setGesture({ type: "marquee", pointerId: event.pointerId, origin: world, current: world, additive: event.shiftKey });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture; if (!current || current.pointerId !== event.pointerId) return;
    if (current.type === "pan") {
      const p = localPoint(event); useViewportStore.getState().setViewport({ ...current.viewport, x: current.viewport.x + p.x - current.start.x, y: current.viewport.y + p.y - current.start.y });
    } else if (current.type === "draw") setGesture({ ...current, current: worldPoint(event), square: event.shiftKey, fromCenter: event.altKey });
    else setGesture({ ...current, current: worldPoint(event) });
  };

  const finishGesture = () => {
    const current = gesture; setGesture(null);
    if (!current || !board) return;
    if (current.type === "draw") {
      let bounds = creationBounds(current.origin, current.current, current.square, current.fromCenter);
      if (bounds.width < 4 && bounds.height < 4) bounds = { x: current.origin.x, y: current.origin.y, width: 160, height: 100 };
      if (board.preferences.snapToGrid) { const grid = board.preferences.gridSize; bounds = { x: Math.round(bounds.x / grid) * grid, y: Math.round(bounds.y / grid) * grid, width: Math.max(16, Math.round(bounds.width / grid) * grid), height: Math.max(16, Math.round(bounds.height / grid) * grid) }; }
      if (bounds.width >= 16 && bounds.height >= 16) { const id = useBoardStore.getState().createRectangle(bounds); if (id) useSessionStore.getState().setSelected([id]); useSessionStore.getState().setTool("select"); }
    } else if (current.type === "marquee") {
      const bounds = normalizeBounds(current.origin, current.current); const found = ordered.filter((e) => !e.hidden && !e.locked && containsBounds(bounds, e)).map((e) => e.id);
      useSessionStore.getState().setSelected(current.additive ? [...new Set([...selectedIds, ...found])] : found);
    } else if (current.type === "move") {
      let dx = current.current.x - current.origin.x, dy = current.current.y - current.origin.y;
      if (board.preferences.snapToGrid && current.initial[0]) { const grid = board.preferences.gridSize; dx = Math.round((current.initial[0].x + dx) / grid) * grid - current.initial[0].x; dy = Math.round((current.initial[0].y + dy) / grid) * grid - current.initial[0].y; }
      if (dx || dy) useBoardStore.getState().commit("Move selection", (draftBoard) => current.initial.forEach((e) => { const item = draftBoard.elements[e.id]; item.x = e.x + dx; item.y = e.y + dy; }));
    } else if (current.type === "resize") {
      const next = resizedBounds(current.initialBounds, current.handle, { x: current.current.x - current.origin.x, y: current.current.y - current.origin.y }); const scaled = scaleElements(current.initial, current.initialBounds, next);
      useBoardStore.getState().commit("Resize selection", (draftBoard) => scaled.forEach((e) => { const item = draftBoard.elements[e.id]; Object.assign(item, { x: e.x, y: e.y, width: e.width, height: e.height }); }));
    }
  };

  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const down = async (event: KeyboardEvent) => {
      if (editable(event.target)) { if (event.key === "Escape") (event.target as HTMLElement).blur(); return; }
      const mod = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase();
      if (event.code === "Space") { event.preventDefault(); useSessionStore.getState().setSpaceHeld(true); }
      if (!mod && key === "v") useSessionStore.getState().setTool("select");
      else if (!mod && key === "h") useSessionStore.getState().setTool("hand");
      else if (!mod && key === "r") useSessionStore.getState().setTool("rectangle");
      else if (event.key === "Escape") { setGesture(null); useSessionStore.getState().setSelected([]); useSessionStore.getState().setTool("select"); }
      else if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) useBoardStore.getState().redo(); else useBoardStore.getState().undo(); }
      else if (mod && key === "y") { event.preventDefault(); useBoardStore.getState().redo(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) { event.preventDefault(); useBoardStore.getState().deleteElements(selectedIds); useSessionStore.getState().setSelected([]); }
      else if (mod && key === "d") { event.preventDefault(); useSessionStore.getState().setSelected(useBoardStore.getState().duplicateElements(selectedIds)); }
      else if (mod && key === "a") { event.preventDefault(); useSessionStore.getState().setSelected(ordered.filter((e) => !e.locked && !e.hidden).map((e) => e.id)); }
      else if (mod && key === "c") { event.preventDefault(); await copyElements(ordered.filter((e) => selectedIds.includes(e.id))); }
      else if (mod && key === "x") { event.preventDefault(); const elements = ordered.filter((e) => selectedIds.includes(e.id)); await copyElements(elements); useBoardStore.getState().deleteElements(selectedIds); useSessionStore.getState().setSelected([]); }
      else if (mod && key === "v") { event.preventDefault(); useSessionStore.getState().setSelected(useBoardStore.getState().pasteElements(await readElements())); }
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedIds.length) {
        event.preventDefault(); const amount = event.shiftKey ? 10 : 1; const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0; const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        useBoardStore.getState().commit("Nudge selection", (draftBoard) => selectedIds.forEach((id) => { draftBoard.elements[id].x += dx; draftBoard.elements[id].y += dy; }));
      }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") useSessionStore.getState().setSpaceHeld(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [ordered, selectedIds]);

  if (!board) return <div className="loading-canvas"><span /><p>Opening your draft…</p></div>;
  const cursor = spaceHeld || activeTool === "hand" ? "grab" : activeTool === "rectangle" ? "crosshair" : "default";
  return <main ref={rootRef} className="canvas-workspace" aria-label="Draftspace infinite canvas" data-tool={activeTool} style={{ cursor }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishGesture} onPointerCancel={finishGesture} onWheel={(event) => { event.preventDefault(); const p = localPoint(event); if (event.ctrlKey || Math.abs(event.deltaY) > Math.abs(event.deltaX)) useViewportStore.getState().zoomAt(p, viewport.zoom * Math.exp(-event.deltaY * .0015)); else useViewportStore.getState().panBy({ x: -event.deltaX, y: -event.deltaY }); }}>
    <SceneCanvas board={board} viewport={viewport} elements={displayed} width={size.width} height={size.height} draftRectangle={draft} />
    <InteractionOverlay bounds={selectedBounds} marquee={marquee} viewport={viewport} />
    {!board.elementIds.length && !draft && <div className="empty-hint"><p>Start with a rectangle</p><span>Press <kbd>R</kbd>, then drag anywhere</span></div>}
    <ToolRail /><ViewportControls size={size} />
  </main>;
}
