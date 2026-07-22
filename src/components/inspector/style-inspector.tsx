"use client";

import { useCallback, useMemo, type KeyboardEvent } from "react";
import type { CanvasElement, ShapeStylePatch } from "@/core/elements/types";
import { ColorControl } from "./color-control";
import { InspectorModeControls } from "./inspector-mode-controls";
import { applyStylePreview, sharedValue, visibleRecentColors, type SharedValue } from "@/features/inspector/style-values";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { useUiPreferencesStore, type InspectorMode } from "@/stores/ui-preferences-store";
import { useCollaborationStore } from "@/stores/collaboration-store";

const capitalize = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

function selectionLabel(elements: readonly CanvasElement[]) {
  if (!elements.length) return "No selection";
  if (elements.length === 1) return capitalize(elements[0].type);
  const types = new Set(elements.map((element) => element.type));
  return types.size === 1 ? `${elements.length} ${elements[0].type}s` : `${elements.length} mixed shapes`;
}

function representative<T>(value: SharedValue<T>, fallback: T): T {
  return value.kind === "value" ? value.value : value.kind === "mixed" ? value.representative : fallback;
}

export function StyleInspector() {
  const board = useBoardStore((state) => state.board);
  const selectedIds = useSessionStore((state) => state.selectedIds);
  const preview = useSessionStore((state) => state.stylePreview);
  const hydrated = useUiPreferencesStore((state) => state.hydrated);
  const preferences = useUiPreferencesStore((state) => state.inspector);
  const collaborationMode = useCollaborationStore((state) => state.mode); const collaborationStatus = useCollaborationStore((state) => state.status); const collaborationRole = useCollaborationStore((state) => state.role);
  const readOnly = collaborationMode === "guest" && (collaborationStatus !== "connected" || collaborationRole !== "editor");
  const selected = useMemo(() => board ? selectedIds.map((id) => board.elements[id]).filter((element): element is CanvasElement => Boolean(element)) : [], [board, selectedIds]);
  const previewIds = useMemo(() => new Set(preview?.elementIds ?? []), [preview]);
  const displayed = useMemo(() => preview ? selected.map((element) => applyStylePreview(element, preview, previewIds)) : selected, [selected, preview, previewIds]);
  const rectangles = displayed.filter((element) => element.type === "rectangle");
  const recentColors = visibleRecentColors(preferences.recentColors);

  const finishPreview = useCallback((recentColor?: string) => {
    const active = useSessionStore.getState().stylePreview;
    if (active) {
      useSessionStore.getState().setStylePreview(null);
      useBoardStore.getState().applyElementStyles(active.elementIds, active.patch);
      if (recentColor) useUiPreferencesStore.getState().recordRecentColor(recentColor);
    }
  }, []);
  const cancelPreview = useCallback(() => useSessionStore.getState().setStylePreview(null), []);
  const previewStyle = useCallback((patch: ShapeStylePatch) => {
    const current = useSessionStore.getState().stylePreview;
    const sameSelection = current && current.elementIds.length === selectedIds.length && current.elementIds.every((id, index) => id === selectedIds[index]);
    useSessionStore.getState().setStylePreview({ elementIds: [...selectedIds], patch: sameSelection ? { ...current.patch, ...patch } : patch });
  }, [selectedIds]);
  const applyStyle = useCallback((patch: ShapeStylePatch, recentColor?: string) => {
    finishPreview();
    useBoardStore.getState().applyElementStyles(selectedIds, patch);
    if (recentColor) useUiPreferencesStore.getState().recordRecentColor(recentColor);
  }, [finishPreview, selectedIds]);
  const selectMode = useCallback((mode: InspectorMode) => {
    finishPreview();
    useUiPreferencesStore.getState().setInspectorMode(mode);
  }, [finishPreview]);

  if (!hydrated || readOnly || preferences.mode === "hidden" || (preferences.mode === "floating" && !selected.length)) return null;

  const fill = sharedValue(displayed, (element) => element.fillColor);
  const stroke = sharedValue(displayed, (element) => element.strokeColor);
  const strokeWidth = sharedValue(displayed, (element) => element.strokeWidth);
  const strokeStyle = sharedValue(displayed, (element) => element.strokeStyle);
  const opacity = sharedValue(displayed, (element) => element.opacity);
  const cornerRadius = sharedValue(rectangles, (element) => element.type === "rectangle" ? element.cornerRadius : 0);
  const opacityPercent = Math.round(representative(opacity, 1) * 100);
  const cornerValue = Math.round(representative(cornerRadius, 0));
  const continuousHandlers = (commitColor?: () => string | undefined) => ({
    onPointerUp: () => finishPreview(commitColor?.()),
    onBlur: () => finishPreview(commitColor?.()),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") { event.preventDefault(); cancelPreview(); event.currentTarget.blur(); }
      else if (event.key === "Enter") { finishPreview(commitColor?.()); event.currentTarget.blur(); }
    },
  });

  return <aside className={`style-inspector ${preferences.mode}`} role={preferences.mode === "floating" ? "toolbar" : "complementary"} aria-label="Style inspector">
    <div className="inspector-header">
      <div><strong>Style</strong><span>{selectionLabel(selected)}</span></div>
      <InspectorModeControls mode={preferences.mode} onSelect={selectMode} />
    </div>
    {!selected.length ? <div className="inspector-empty"><strong>Select a shape</strong><p>Select a shape to edit its style.</p></div> : <div className="inspector-controls">
      <ColorControl label="Fill" value={fill} allowNone recentColors={recentColors} onSelect={(color) => applyStyle({ fillColor: color }, color ?? undefined)} onPreview={(color) => previewStyle({ fillColor: color })} onCommit={(color) => finishPreview(color)} onCancel={cancelPreview} />
      <ColorControl label="Stroke" value={stroke} recentColors={recentColors} onSelect={(color) => color && applyStyle({ strokeColor: color }, color)} onPreview={(color) => previewStyle({ strokeColor: color })} onCommit={(color) => finishPreview(color)} onCancel={cancelPreview} />
      <fieldset className="inspector-group compact-group"><legend>Width{strokeWidth.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend><div className="segmented-control">
        {[1, 2, 4, 8].map((width) => <button key={width} type="button" aria-label={`Set stroke width to ${width}`} aria-pressed={strokeWidth.kind === "value" && strokeWidth.value === width} onClick={() => applyStyle({ strokeWidth: width })}>{width}</button>)}
      </div></fieldset>
      <fieldset className="inspector-group compact-group"><legend>Stroke style{strokeStyle.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend><div className="segmented-control line-styles">
        {(["solid", "dashed", "dotted"] as const).map((style) => <button key={style} type="button" aria-label={`Set stroke style to ${style}`} aria-pressed={strokeStyle.kind === "value" && strokeStyle.value === style} onClick={() => applyStyle({ strokeStyle: style })}><span className={style} /></button>)}
      </div></fieldset>
      <fieldset className="inspector-group range-group"><legend>Opacity{opacity.kind === "mixed" && <span className="mixed-value">Mixed</span>}<output>{opacityPercent}%</output></legend><input type="range" min="10" max="100" step="1" value={Math.max(10, opacityPercent)} aria-label="Opacity" aria-valuetext={opacity.kind === "mixed" ? `Mixed, representative ${opacityPercent}%` : `${opacityPercent}%`} onChange={(event) => previewStyle({ opacity: Number(event.currentTarget.value) / 100 })} {...continuousHandlers()} /></fieldset>
      {rectangles.length > 0 && <fieldset className="inspector-group range-group"><legend>Corners{rectangles.length !== displayed.length && <small>Rectangles only</small>}{cornerRadius.kind === "mixed" && <span className="mixed-value">Mixed</span>}<output>{cornerValue}</output></legend><input type="range" min="0" max="100" step="1" value={cornerValue} aria-label="Corner radius" aria-valuetext={cornerRadius.kind === "mixed" ? `Mixed, representative ${cornerValue}` : `${cornerValue}`} onChange={(event) => previewStyle({ cornerRadius: Number(event.currentTarget.value) })} {...continuousHandlers()} /></fieldset>}
    </div>}
  </aside>;
}
