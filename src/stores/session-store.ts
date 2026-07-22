import { create } from "zustand";
import type { Bounds, Point, ShapeStylePatch, ShapeType } from "@/core/elements/types";

export type Tool = "select" | "hand" | ShapeType;
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type Preview =
  | { type: ShapeType; bounds: Bounds }
  | { type: "marquee"; bounds: Bounds }
  | null;

export type StylePreview = {
  elementIds: string[];
  patch: ShapeStylePatch;
};

type SessionStore = {
  activeTool: Tool;
  selectedIds: string[];
  preview: Preview;
  stylePreview: StylePreview | null;
  spaceHeld: boolean;
  setTool: (tool: Tool) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  setPreview: (preview: Preview) => void;
  setStylePreview: (preview: StylePreview | null) => void;
  setSpaceHeld: (held: boolean) => void;
  pointerWorld: Point | null;
  setPointerWorld: (point: Point | null) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  activeTool: "select", selectedIds: [], preview: null, stylePreview: null, spaceHeld: false, pointerWorld: null,
  setTool: (activeTool) => set({ activeTool }),
  setSelected: (selectedIds) => set({ selectedIds }),
  toggleSelected: (id) => set((state) => ({ selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id] })),
  setPreview: (preview) => set({ preview }),
  setStylePreview: (stylePreview) => set({ stylePreview }),
  setSpaceHeld: (spaceHeld) => set({ spaceHeld }),
  setPointerWorld: (pointerWorld) => set({ pointerWorld }),
}));
