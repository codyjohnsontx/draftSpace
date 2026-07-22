"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement, Point, ShapeType } from "@/core/elements/types";
import { creationBounds, normalizeBounds, selectionBounds } from "@/core/geometry/bounds";
import { elementsContainedByBounds, hitTestElements } from "@/core/geometry/hit-testing";
import { screenToWorld } from "@/core/geometry/coordinates";
import { resizedBounds, scaleElements } from "@/core/geometry/resize";
import { snapBoundsToGrid, snappedMoveDelta } from "@/core/geometry/snapping";
import { classifyWheelGesture } from "@/core/interaction/wheel";
import { copyElements, readElements } from "@/features/clipboard/clipboard";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore, type ResizeHandle } from "@/stores/session-store";
import { useViewportStore } from "@/stores/viewport-store";
import { SceneCanvas } from "./scene-canvas";
import { InteractionOverlay } from "./interaction-overlay";
import { ToolRail } from "@/components/toolbar/tool-rail";
import { ViewportControls } from "@/components/controls/viewport-controls";
import { observeElementSize } from "@/lib/browser/observe-element-size";
import { markInteraction, measurePerformance } from "@/features/performance/performance-monitor";
import { applyStylePreview } from "@/features/inspector/style-values";
import { collaborationController } from "@/features/collaboration/collaboration-controller";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { RemotePresenceOverlay } from "@/components/collaboration/remote-presence-overlay";

type Gesture =
  | { type: "pan"; pointerId: number; start: Point; viewport: Viewport }
  | { type: "draw"; shapeType: ShapeType; pointerId: number; origin: Point; current: Point; square: boolean; fromCenter: boolean }
  | { type: "marquee"; pointerId: number; origin: Point; current: Point; additive: boolean }
  | { type: "move"; pointerId: number; origin: Point; current: Point; initial: CanvasElement[] }
  | { type: "resize"; pointerId: number; origin: Point; current: Point; handle: ResizeHandle; initialBounds: Bounds; initial: CanvasElement[]; preserveAspect: boolean; fromCenter: boolean }
  | null;

const isShapeTool = (tool: string): tool is ShapeType => tool === "rectangle" || tool === "ellipse" || tool === "diamond";

export function CanvasWorkspace() {
  const board = useBoardStore((s) => s.board); const viewport = useViewportStore((s) => s.viewport);
  const selectedIds = useSessionStore((s) => s.selectedIds); const activeTool = useSessionStore((s) => s.activeTool); const spaceHeld = useSessionStore((s) => s.spaceHeld);
  const stylePreview = useSessionStore((s) => s.stylePreview);
  const collaborationMode = useCollaborationStore((s) => s.mode); const collaborationStatus = useCollaborationStore((s) => s.status); const collaborationRole = useCollaborationStore((s) => s.role); const followingHost = useCollaborationStore((s) => s.followingHost);
  const rootRef = useRef<HTMLDivElement>(null); const [gesture, setGesture] = useState<Gesture>(null); const [size, setSize] = useState({ width: 0, height: 0 });
  const lastPresenceAt = useRef(0);
  const guestCanEdit = collaborationMode !== "guest" || (collaborationStatus === "connected" && collaborationRole === "editor");

  useLayoutEffect(() => {
    const node = rootRef.current; if (!node) return;
    return observeElementSize(node, setSize);
  }, [board?.id]);

  const localPoint = useCallback((event: { clientX: number; clientY: number }) => { const rect = rootRef.current!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }, []);
  const worldPoint = useCallback((event: { clientX: number; clientY: number }) => screenToWorld(localPoint(event), useViewportStore.getState().viewport), [localPoint]);
  const ordered = useMemo(() => board ? board.elementIds.map((id) => board.elements[id]).filter(Boolean) : [], [board]);
  const moveDelta = useCallback((current: Extract<NonNullable<Gesture>, { type: "move" }>) => {
    const delta = { x: current.current.x - current.origin.x, y: current.current.y - current.origin.y };
    return board?.preferences.snapToGrid && current.initial[0] ? snappedMoveDelta(current.initial[0], delta, board.preferences.gridSize) : delta;
  }, [board]);

  const displayed = useMemo(() => {
    const current = gesture; if (!current || (current.type !== "move" && current.type !== "resize")) return ordered;
    let changed: CanvasElement[];
    if (current.type === "move") { const { x: dx, y: dy } = moveDelta(current); changed = current.initial.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy })); }
    else { const next = resizedBounds(current.initialBounds, current.handle, { x: current.current.x - current.origin.x, y: current.current.y - current.origin.y }, { preserveAspect: current.preserveAspect, fromCenter: current.fromCenter }); changed = scaleElements(current.initial, current.initialBounds, next); }
    const map = new Map(changed.map((e) => [e.id, e])); return ordered.map((e) => map.get(e.id) ?? e);
  }, [ordered, gesture, moveDelta]);
  const stylePreviewIds = useMemo(() => new Set(stylePreview?.elementIds ?? []), [stylePreview]);
  const renderedElements = useMemo(() => stylePreview ? displayed.map((element) => applyStylePreview(element, stylePreview, stylePreviewIds)) : displayed, [displayed, stylePreview, stylePreviewIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedElements = displayed.filter((e) => selectedIdSet.has(e.id));
  const selectedBounds = selectionBounds(selectedElements);
  const current = gesture;
  const rawDraft = current?.type === "draw" ? creationBounds(current.origin, current.current, current.square, current.fromCenter) : null;
  const draftBounds = rawDraft && board?.preferences.snapToGrid ? snapBoundsToGrid(rawDraft, board.preferences.gridSize) : rawDraft;
  const draftShape = current?.type === "draw" && draftBounds ? { type: current.shapeType, bounds: draftBounds } : null;
  const marquee = current?.type === "marquee" ? normalizeBounds(current.origin, current.current) : null;
  const snapPreview = board?.preferences.snapToGrid && (current?.type === "draw" || current?.type === "move") ? (current.type === "draw" ? draftBounds : selectedBounds) : null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!board || event.button === 2) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, [role='dialog']")) return;
    const screen = localPoint(event); const world = worldPoint(event);
    const handle = target.dataset.resizeHandle as ResizeHandle | undefined;
    rootRef.current?.setPointerCapture(event.pointerId);
    if (followingHost) collaborationController.setFollowingHost(false);
    if (event.button === 1 || activeTool === "hand" || spaceHeld) setGesture({ type: "pan", pointerId: event.pointerId, start: screen, viewport });
    else if (handle && selectedBounds && guestCanEdit) setGesture({ type: "resize", pointerId: event.pointerId, origin: world, current: world, handle, initialBounds: selectedBounds, initial: selectedElements, preserveAspect: event.shiftKey, fromCenter: event.altKey });
    else if (isShapeTool(activeTool) && guestCanEdit) setGesture({ type: "draw", shapeType: activeTool, pointerId: event.pointerId, origin: world, current: world, square: event.shiftKey, fromCenter: event.altKey });
    else {
      const hit = measurePerformance("point-hit-test", ordered.length, () => hitTestElements(ordered, world, 6 / viewport.zoom));
      if (hit) {
        if (event.shiftKey) { useSessionStore.getState().toggleSelected(hit.id); return; }
        const ids = selectedIdSet.has(hit.id) ? selectedIds : [hit.id]; useSessionStore.getState().setSelected(ids);
        if (!guestCanEdit) return;
        const idSet = ids === selectedIds ? selectedIdSet : new Set(ids);
        setGesture({ type: "move", pointerId: event.pointerId, origin: world, current: world, initial: ordered.filter((e) => idSet.has(e.id)) });
      } else setGesture({ type: "marquee", pointerId: event.pointerId, origin: world, current: world, additive: event.shiftKey });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = worldPoint(event); useSessionStore.getState().setPointerWorld(pointer);
    if (performance.now() - lastPresenceAt.current >= 50) { lastPresenceAt.current = performance.now(); collaborationController.publishPresence({ cursor: pointer }); }
    const current = gesture; if (!current || current.pointerId !== event.pointerId) return;
    if (current.type === "pan" || current.type === "move" || current.type === "resize") markInteraction(ordered.length);
    if (current.type === "pan") {
      const p = localPoint(event); useViewportStore.getState().setViewport({ ...current.viewport, x: current.viewport.x + p.x - current.start.x, y: current.viewport.y + p.y - current.start.y });
    } else if (current.type === "draw") setGesture({ ...current, current: worldPoint(event), square: event.shiftKey, fromCenter: event.altKey });
    else if (current.type === "resize") setGesture({ ...current, current: worldPoint(event), preserveAspect: event.shiftKey, fromCenter: event.altKey });
    else setGesture({ ...current, current: worldPoint(event) });
  };

  const finishGesture = () => {
    const current = gesture; setGesture(null);
    if (!current || !board || (!guestCanEdit && current.type !== "pan" && current.type !== "marquee")) return;
    if (current.type === "draw") {
      let bounds = creationBounds(current.origin, current.current, current.square, current.fromCenter);
      if (bounds.width < 4 && bounds.height < 4) bounds = { x: current.origin.x, y: current.origin.y, width: 160, height: 100 };
      if (board.preferences.snapToGrid) bounds = snapBoundsToGrid(bounds, board.preferences.gridSize);
      if (bounds.width >= 16 && bounds.height >= 16) { const id = useBoardStore.getState().createShape(current.shapeType, bounds); if (id) useSessionStore.getState().setSelected([id]); useSessionStore.getState().setTool("select"); }
    } else if (current.type === "marquee") {
      const bounds = normalizeBounds(current.origin, current.current);
      const found = measurePerformance("marquee-select", ordered.length, () => elementsContainedByBounds(ordered, bounds)).map((element) => element.id);
      useSessionStore.getState().setSelected(current.additive ? [...new Set([...selectedIds, ...found])] : found);
    } else if (current.type === "move") {
      const { x: dx, y: dy } = moveDelta(current);
      if (dx || dy) useBoardStore.getState().updateElements(current.initial.map((e) => ({ elementId: e.id, patch: { x: e.x + dx, y: e.y + dy } })), "Move selection", "move");
    } else if (current.type === "resize") {
      const next = resizedBounds(current.initialBounds, current.handle, { x: current.current.x - current.origin.x, y: current.current.y - current.origin.y }, { preserveAspect: current.preserveAspect, fromCenter: current.fromCenter }); const scaled = scaleElements(current.initial, current.initialBounds, next);
      useBoardStore.getState().updateElements(scaled.map((e) => ({ elementId: e.id, patch: { x: e.x, y: e.y, width: e.width, height: e.height } })), "Resize selection", "resize");
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
      else if (!mod && key === "r" && guestCanEdit) useSessionStore.getState().setTool("rectangle");
      else if (!mod && key === "e" && guestCanEdit) useSessionStore.getState().setTool("ellipse");
      else if (!mod && key === "d" && guestCanEdit) useSessionStore.getState().setTool("diamond");
      else if (event.key === "Escape") {
        if (gesture) { setGesture(null); if (gesture.type === "draw") useSessionStore.getState().setTool("select"); }
        else { useSessionStore.getState().setSelected([]); useSessionStore.getState().setTool("select"); }
      }
      else if (mod && key === "z") { event.preventDefault(); if (event.shiftKey) useBoardStore.getState().redo(); else useBoardStore.getState().undo(); }
      else if (mod && key === "y") { event.preventDefault(); useBoardStore.getState().redo(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length && guestCanEdit) { event.preventDefault(); useBoardStore.getState().deleteElements(selectedIds); useSessionStore.getState().setSelected([]); }
      else if (mod && key === "d" && guestCanEdit) { event.preventDefault(); useSessionStore.getState().setSelected(useBoardStore.getState().duplicateElements(selectedIds)); }
      else if (mod && key === "a") { event.preventDefault(); useSessionStore.getState().setSelected(ordered.filter((e) => !e.locked && !e.hidden).map((e) => e.id)); }
      else if (mod && key === "c") { event.preventDefault(); await copyElements(ordered.filter((e) => selectedIdSet.has(e.id))); }
      else if (mod && key === "x" && guestCanEdit) { event.preventDefault(); const elements = ordered.filter((e) => selectedIdSet.has(e.id)); await copyElements(elements); useBoardStore.getState().deleteElements(selectedIds); useSessionStore.getState().setSelected([]); }
      else if (mod && key === "v" && guestCanEdit) { event.preventDefault(); useSessionStore.getState().setSelected(useBoardStore.getState().pasteElements(await readElements())); }
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedIds.length && guestCanEdit) {
        event.preventDefault(); const amount = event.shiftKey ? 10 : 1; const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0; const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
        const board = useBoardStore.getState().board;
        if (board) useBoardStore.getState().updateElements(selectedIds.flatMap((id) => { const element = board.elements[id]; return element ? [{ elementId: id, patch: { x: element.x + dx, y: element.y + dy } }] : []; }), "Nudge selection", "move");
      }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") useSessionStore.getState().setSpaceHeld(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [gesture, ordered, selectedIds, selectedIdSet, guestCanEdit]);

  useEffect(() => { collaborationController.publishPresence(); }, [selectedIds, activeTool]);
  useEffect(() => { if (collaborationMode === "host" && useCollaborationStore.getState().presenting) collaborationController.publishPresence(); }, [viewport, collaborationMode]);

  useEffect(() => {
    const cancel = () => setGesture(null);
    window.addEventListener("blur", cancel); return () => window.removeEventListener("blur", cancel);
  }, []);

  if (!board) return <div className="loading-canvas"><span /><p>Opening your draft…</p></div>;
  const cursor = spaceHeld || activeTool === "hand" ? "grab" : isShapeTool(activeTool) ? "crosshair" : "default";
  return <main ref={rootRef} className="canvas-workspace" aria-label="Draftspace infinite canvas" data-tool={activeTool} data-board-ready="true" data-element-count={board.elementIds.length} data-collaboration-readonly={!guestCanEdit || undefined} style={{ cursor }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={() => { useSessionStore.getState().setPointerWorld(null); collaborationController.publishPresence({ cursor: null }); }} onPointerUp={finishGesture} onPointerCancel={() => setGesture(null)} onWheel={(event) => { event.preventDefault(); if (followingHost) collaborationController.setFollowingHost(false); markInteraction(ordered.length); const p = localPoint(event); if (classifyWheelGesture(event) === "zoom") useViewportStore.getState().zoomAt(p, viewport.zoom * Math.exp(-event.deltaY * .0015)); else useViewportStore.getState().panBy({ x: -event.deltaX, y: -event.deltaY }); }}>
    <SceneCanvas board={board} viewport={viewport} elements={renderedElements} width={size.width} height={size.height} draftShape={draftShape} />
    <InteractionOverlay bounds={selectedBounds} marquee={marquee} snapBounds={snapPreview} viewport={viewport} />
    <RemotePresenceOverlay board={board} viewport={viewport} />
    {!board.elementIds.length && !draftShape && <div className="empty-hint"><p>Start with a shape</p><span>Press <kbd>R</kbd>, <kbd>E</kbd>, or <kbd>D</kbd>, then drag anywhere</span></div>}
    <ToolRail /><ViewportControls size={size} />
  </main>;
}
