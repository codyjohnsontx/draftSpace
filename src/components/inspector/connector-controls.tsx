"use client";

import { useCallback, useEffect, useMemo, type KeyboardEvent } from "react";
import { CONNECTOR_LABEL_MAX_LENGTH, type Connector, type ConnectorArrows, type ConnectorKind, type ConnectorMutablePatch } from "@/core/elements/types";
import { ColorControl } from "./color-control";
import { sharedValue } from "@/features/inspector/style-values";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { useUiPreferencesStore } from "@/stores/ui-preferences-store";

/**
 * What an edge means, which is also how it is drawn: a call that waits, a
 * message that does not, or data moving. The dash pattern belongs to the kind
 * rather than being set separately, so an edge cannot say one thing and look
 * like another.
 */
export const CONNECTOR_KINDS: ReadonlyArray<{ kind: ConnectorKind; name: string }> = [
  { kind: "sync", name: "Sync" },
  { kind: "async", name: "Async" },
  { kind: "data", name: "Data" },
];

/**
 * Which ends of an edge carry a head, shown as the edge itself, since the whole
 * control is about what the line will look like. A head belongs to an end of
 * the binding rather than to a direction on screen, so the source end stays the
 * source however the two objects are placed.
 */
const HEAD_AT_TARGET = "M15 6 L11 3.7 L11 8.3 Z";
const HEAD_AT_SOURCE = "M1 6 L5 3.7 L5 8.3 Z";
export const CONNECTOR_ARROWS: ReadonlyArray<{ arrows: ConnectorArrows; name: string; shaft: string; heads: readonly string[] }> = [
  { arrows: "none", name: "no heads", shaft: "M1 6 H15", heads: [] },
  { arrows: "end", name: "a head at the target", shaft: "M1 6 H11.5", heads: [HEAD_AT_TARGET] },
  { arrows: "start", name: "a head at the source", shaft: "M4.5 6 H15", heads: [HEAD_AT_SOURCE] },
  // The shaft is kept clear of both heads, or two heads this close read as one blob rather than as an edge.
  { arrows: "both", name: "heads at both ends", shaft: "M4.5 6 H11.5", heads: [HEAD_AT_TARGET, HEAD_AT_SOURCE] },
];

/**
 * The inspector's controls for the edges the selection is holding. An edge
 * carries a color, a width, a choice of heads, a kind, and a name - it has no
 * fill and no box, so it is a different set of controls rather than the element
 * ones with most of them hidden.
 */
export function ConnectorControls({ connectors, recentColors }: { connectors: readonly Connector[]; recentColors: readonly string[] }) {
  const ids = useMemo(() => connectors.map((connector) => connector.id), [connectors]);
  const stroke = sharedValue(connectors, (connector) => connector.strokeColor);
  const strokeWidth = sharedValue(connectors, (connector) => connector.strokeWidth);
  const kind = sharedValue(connectors, (connector) => connector.kind);
  const arrows = sharedValue(connectors, (connector) => connector.arrows);
  // A name belongs to one edge the way a board's does, so it is offered only when one edge is held.
  const sole = connectors.length === 1 ? connectors[0] : null;

  // A preview is a style being tried out on the edges the selection holds; once it holds none, nothing is being tried.
  useEffect(() => () => useSessionStore.getState().setConnectorStylePreview(null), []);

  const finishPreview = useCallback((recentColor?: string) => {
    const active = useSessionStore.getState().connectorStylePreview;
    if (!active) return;
    useSessionStore.getState().setConnectorStylePreview(null);
    useBoardStore.getState().updateConnectors(active.connectorIds, active.patch);
    if (recentColor) useUiPreferencesStore.getState().recordRecentColor(recentColor);
  }, []);
  const cancelPreview = useCallback(() => useSessionStore.getState().setConnectorStylePreview(null), []);
  const previewStyle = useCallback((patch: ConnectorMutablePatch) => {
    const current = useSessionStore.getState().connectorStylePreview;
    const sameSelection = current && current.connectorIds.length === ids.length && current.connectorIds.every((id, index) => id === ids[index]);
    useSessionStore.getState().setConnectorStylePreview({ connectorIds: [...ids], patch: sameSelection ? { ...current.patch, ...patch } : patch });
  }, [ids]);
  const applyStyle = useCallback((patch: ConnectorMutablePatch, recentColor?: string) => {
    finishPreview();
    useBoardStore.getState().updateConnectors(ids, patch);
    if (recentColor) useUiPreferencesStore.getState().recordRecentColor(recentColor);
  }, [finishPreview, ids]);
  const commitLabel = useCallback((value: string) => {
    if (!sole) return;
    const next = value.trim().slice(0, CONNECTOR_LABEL_MAX_LENGTH);
    // An edge with nothing written on it carries no name at all, so a cleared field draws nothing.
    const label = next ? next : null;
    if (label === sole.label) return;
    useBoardStore.getState().updateConnectors([sole.id], { label }, "Rename connector", "rename");
  }, [sole]);

  return <div className="inspector-controls">
    <ColorControl label="Stroke" value={stroke} recentColors={recentColors} onSelect={(color) => color && applyStyle({ strokeColor: color }, color)} onPreview={(color) => previewStyle({ strokeColor: color })} onCommit={(color) => finishPreview(color)} onCancel={cancelPreview} />
    <fieldset className="inspector-group compact-group"><legend>Width{strokeWidth.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend><div className="segmented-control">
      {[1, 2, 4, 8].map((width) => <button key={width} type="button" aria-label={`Set connector width to ${width}`} aria-pressed={strokeWidth.kind === "value" && strokeWidth.value === width} onClick={() => applyStyle({ strokeWidth: width })}>{width}</button>)}
    </div></fieldset>
    <fieldset className="inspector-group compact-group"><legend>Arrows{arrows.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend><div className="segmented-control arrow-styles">
      {CONNECTOR_ARROWS.map(({ arrows: value, name, shaft, heads }) => <button key={value} type="button" aria-label={`Set connector arrows to ${name}`} aria-pressed={arrows.kind === "value" && arrows.value === value} onClick={() => applyStyle({ arrows: value })}>
        <svg viewBox="0 0 16 12" aria-hidden="true" focusable="false">
          <path className="shaft" d={shaft} />
          {heads.map((head) => <path key={head} className="head" d={head} />)}
        </svg>
      </button>)}
    </div></fieldset>
    <fieldset className="inspector-group compact-group"><legend>Connector kind{kind.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend><div className="segmented-control">
      {CONNECTOR_KINDS.map(({ kind: value, name }) => <button key={value} type="button" aria-label={`Set connector kind to ${value}`} aria-pressed={kind.kind === "value" && kind.value === value} onClick={() => applyStyle({ kind: value })}>{name}</button>)}
    </div></fieldset>
    {sole && <fieldset className="inspector-group text-group"><legend>Label</legend>
      <input
        // Re-seeded from the edge whenever its stored name changes, so an undo shows the name it put back.
        key={`${sole.id}:${sole.label ?? ""}`}
        type="text"
        className="label-input"
        defaultValue={sole.label ?? ""}
        maxLength={CONNECTOR_LABEL_MAX_LENGTH}
        placeholder="Name this edge"
        aria-label="Connector label"
        onBlur={(event) => commitLabel(event.currentTarget.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") { event.preventDefault(); commitLabel(event.currentTarget.value); event.currentTarget.blur(); }
          else if (event.key === "Escape") { event.preventDefault(); event.currentTarget.value = sole.label ?? ""; event.currentTarget.blur(); }
        }}
      />
    </fieldset>}
  </div>;
}
