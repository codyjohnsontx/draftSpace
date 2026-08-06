import { create } from "zustand";
import type { Bounds, ConnectorMutablePatch, Point, ShapeStylePatch, ShapeType } from "@/core/elements/types";

/** The connector makes an edge rather than an element, so it has no shape behind it. */
export type Tool = "select" | "hand" | "connector" | ShapeType;
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Preview =
  | { type: ShapeType; bounds: Bounds }
  | { type: "marquee"; bounds: Bounds }
  | null;

export type StylePreview = {
  elementIds: string[];
  patch: ShapeStylePatch;
};

/**
 * An edge style being tried out before it is committed - the connector twin of
 * `stylePreview`. It is a field of its own rather than a second arm of that
 * type because an edge and an element take different patches, and because a
 * selection holds one kind or the other, so the two can never both be showing.
 */
export type ConnectorStylePreview = {
  connectorIds: string[];
  patch: ConnectorMutablePatch;
};

type SessionStore = {
  activeTool: Tool;
  selectedIds: string[];
  /**
   * The edges the selection is holding. A selection holds elements or edges,
   * never both: an edge cannot be moved, duplicated, or copied on its own (it
   * travels only when both of the elements it joins are copied), so a mixed
   * selection would make every one of those mean "do this to the part of the
   * selection it applies to". Taking one kind therefore drops the other.
   */
  selectedConnectorIds: string[];
  preview: Preview;
  stylePreview: StylePreview | null;
  connectorStylePreview: ConnectorStylePreview | null;
  spaceHeld: boolean;
  setTool: (tool: Tool) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  setSelectedConnectors: (ids: string[]) => void;
  toggleSelectedConnector: (id: string) => void;
  setPreview: (preview: Preview) => void;
  setStylePreview: (preview: StylePreview | null) => void;
  setConnectorStylePreview: (preview: ConnectorStylePreview | null) => void;
  setSpaceHeld: (held: boolean) => void;
  pointerWorld: Point | null;
  setPointerWorld: (point: Point | null) => void;
};

/** The other kind of selection, dropped - keeping the array it already was when it is already empty, so taking one kind costs nothing when no other is held. */
const dropped = (held: string[]): string[] => held.length ? [] : held;
const toggle = (held: string[], id: string): string[] => held.includes(id) ? held.filter((item) => item !== id) : [...held, id];

export const useSessionStore = create<SessionStore>((set) => ({
  activeTool: "select", selectedIds: [], selectedConnectorIds: [], preview: null, stylePreview: null, connectorStylePreview: null, spaceHeld: false, pointerWorld: null,
  setTool: (activeTool) => set({ activeTool }),
  setSelected: (selectedIds) => set((state) => ({ selectedIds, selectedConnectorIds: dropped(state.selectedConnectorIds) })),
  toggleSelected: (id) => set((state) => ({ selectedIds: toggle(state.selectedIds, id), selectedConnectorIds: dropped(state.selectedConnectorIds) })),
  setSelectedConnectors: (selectedConnectorIds) => set((state) => ({ selectedConnectorIds, selectedIds: dropped(state.selectedIds) })),
  toggleSelectedConnector: (id) => set((state) => ({ selectedConnectorIds: toggle(state.selectedConnectorIds, id), selectedIds: dropped(state.selectedIds) })),
  setPreview: (preview) => set({ preview }),
  setStylePreview: (stylePreview) => set({ stylePreview }),
  setConnectorStylePreview: (connectorStylePreview) => set({ connectorStylePreview }),
  setSpaceHeld: (spaceHeld) => set({ spaceHeld }),
  setPointerWorld: (pointerWorld) => set({ pointerWorld }),
}));
