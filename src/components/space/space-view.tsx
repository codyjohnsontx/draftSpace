"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { snapValue } from "@/core/geometry/snapping";
import { createSpaceScene, worldToBoard, TIER_HEIGHT, type SpaceScene } from "@/features/space/scene";
import type { PortSide } from "@/core/elements/types";

/** Mirrors CanvasWorkspace: guests may only edit once admitted as an editor. */
function guestCanEdit(): boolean {
  const { mode, status, role } = useCollaborationStore.getState();
  return mode !== "guest" || (status === "connected" && role === "editor");
}

type DragState =
  | { mode: "node"; elementId: string; offsetX: number; offsetY: number; tierY: number; moved: boolean }
  | { mode: "connect"; elementId: string; side: PortSide }
  | { mode: "orbit"; startX: number; startY: number; tilt: number; azimuth: number }
  | { mode: "pan"; startX: number; startY: number; targetX: number; targetZ: number }
  | null;

export function SpaceView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SpaceScene | null>(null);
  const dragRef = useRef<DragState>(null);
  const [ready, setReady] = useState<"webgl" | "fallback" | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let scene: SpaceScene | null = null;
    try {
      scene = createSpaceScene(canvas);
    } catch {
      queueMicrotask(() => { if (active) setReady("fallback"); });
      return () => { active = false; };
    }
    sceneRef.current = scene;
    queueMicrotask(() => { if (active) setReady("webgl"); });

    const syncFromStores = () => {
      const board = useBoardStore.getState().board;
      if (board) scene!.syncBoard(board);
      scene!.setSelection(useSessionStore.getState().selectedIds);
    };
    syncFromStores();
    const unsubscribeBoard = useBoardStore.subscribe(syncFromStores);
    const unsubscribeSession = useSessionStore.subscribe((state, previous) => {
      if (state.selectedIds !== previous.selectedIds) scene!.setSelection(state.selectedIds);
    });
    const onResize = () => scene!.resize();
    window.addEventListener("resize", onResize);

    return () => {
      active = false;
      unsubscribeBoard();
      unsubscribeSession();
      window.removeEventListener("resize", onResize);
      scene!.dispose();
      sceneRef.current = null;
    };
  }, []);

  const toNdc = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ndc = toNdc(event);
    const view = scene.getView();

    if (event.button === 2 || event.altKey) {
      dragRef.current = { mode: "orbit", startX: event.clientX, startY: event.clientY, tilt: view.tilt, azimuth: view.azimuth };
      return;
    }
    if (event.button === 1 || event.shiftKey) {
      dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, targetX: view.targetX, targetZ: view.targetZ };
      return;
    }

    const hit = scene.pick(ndc);
    if (hit?.kind === "port" && guestCanEdit()) {
      dragRef.current = { mode: "connect", elementId: hit.elementId, side: hit.side };
      return;
    }
    if (hit?.kind === "node") {
      const board = useBoardStore.getState().board;
      const element = board?.elements[hit.elementId];
      if (!element) return;
      useSessionStore.getState().setSelected([hit.elementId]);
      if (element.locked || !guestCanEdit()) return;
      const tierY = element.layer * TIER_HEIGHT;
      const ground = scene.groundPoint(ndc, tierY);
      if (!ground) return;
      const pointer = worldToBoard(ground);
      dragRef.current = { mode: "node", elementId: hit.elementId, offsetX: element.x - pointer.x, offsetY: element.y - pointer.y, tierY, moved: false };
      return;
    }
    useSessionStore.getState().setSelected([]);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const drag = dragRef.current;
    const ndc = toNdc(event);

    if (!drag) {
      const hit = scene.pick(ndc);
      scene.setHovered(hit ? hit.elementId : null);
      return;
    }
    if (drag.mode === "orbit") {
      scene.setView({
        tilt: drag.tilt + (event.clientY - drag.startY) * 0.005,
        azimuth: drag.azimuth - (event.clientX - drag.startX) * 0.005,
      });
      return;
    }
    if (drag.mode === "pan") {
      const view = scene.getView();
      const perPixel = 1 / view.pixelsPerUnit;
      scene.setView({
        targetX: drag.targetX - (event.clientX - drag.startX) * perPixel,
        targetZ: drag.targetZ - (event.clientY - drag.startY) * perPixel,
      });
      return;
    }
    if (drag.mode === "connect") {
      const ground = scene.groundPoint(ndc, 0.4);
      scene.setConnectGhost({ elementId: drag.elementId, side: drag.side }, ground);
      return;
    }
    const board = useBoardStore.getState().board;
    const element = board?.elements[drag.elementId];
    const ground = scene.groundPoint(ndc, drag.tierY);
    if (!board || !element || !ground) return;
    const pointer = worldToBoard(ground);
    let x = pointer.x + drag.offsetX;
    let y = pointer.y + drag.offsetY;
    if (board.preferences.snapToGrid) {
      x = snapValue(x, board.preferences.gridSize);
      y = snapValue(y, board.preferences.gridSize);
    }
    drag.moved = true;
    scene.setDragPreview(drag.elementId, { x, y });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!scene || !drag) return;

    if (drag.mode === "connect") {
      scene.setConnectGhost(null);
      const hit = scene.pick(toNdc(event));
      if (hit && hit.elementId !== drag.elementId && guestCanEdit()) {
        useBoardStore.getState().createConnector({ elementId: drag.elementId, port: drag.side }, { elementId: hit.elementId, port: "auto" });
      }
      return;
    }
    if (drag.mode === "node") {
      const board = useBoardStore.getState().board;
      const element = board?.elements[drag.elementId];
      scene.setDragPreview(drag.elementId, null);
      if (!board || !element || !drag.moved) return;
      const ground = scene.groundPoint(toNdc(event), drag.tierY);
      if (!ground) return;
      const pointer = worldToBoard(ground);
      let x = pointer.x + drag.offsetX;
      let y = pointer.y + drag.offsetY;
      if (board.preferences.snapToGrid) {
        x = snapValue(x, board.preferences.gridSize);
        y = snapValue(y, board.preferences.gridSize);
      }
      if ((x !== element.x || y !== element.y) && guestCanEdit()) {
        useBoardStore.getState().updateElements([{ elementId: drag.elementId, patch: { x, y } }], "Move shape", "move");
      }
    }
  };

  // Native, non-passive so we can preventDefault the browser's zoom/scroll gesture over the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const scene = sceneRef.current;
      if (!scene) return;
      event.preventDefault();
      const view = scene.getView();
      if (event.ctrlKey || event.metaKey) {
        scene.setView({ pixelsPerUnit: Math.min(80, Math.max(6, view.pixelsPerUnit * (event.deltaY > 0 ? 0.92 : 1.08))) });
        return;
      }
      const perPixel = 1 / view.pixelsPerUnit;
      scene.setView({ targetX: view.targetX + event.deltaX * perPixel, targetZ: view.targetZ + event.deltaY * perPixel });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const selected = useSessionStore.getState().selectedIds;
      if (!selected.length) return;
      event.preventDefault();
      useBoardStore.getState().deleteElements([...selected]);
      useSessionStore.getState().setSelected([]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="canvas-workspace space-view" aria-label="Draftspace 3D space" data-space-ready={ready ?? undefined}>
      <canvas
        ref={canvasRef}
        className="space-canvas"
        data-testid="space-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      />
      {ready === "fallback" && <p className="space-fallback">This browser cannot create a 3D view. The 2D canvas still has everything.</p>}
      <p className="space-hint">Drag nodes to move · drag a port to connect · Alt-drag to tilt · Shift-drag to pan · ⌘-scroll to zoom</p>
    </main>
  );
}
