import { create } from "zustand";
import type { Viewport } from "@/core/board/types";
import type { Bounds, Point } from "@/core/elements/types";
import { zoomAt } from "@/core/geometry/coordinates";

type ViewportStore = {
  viewport: Viewport;
  setViewport: (viewport: Viewport) => void;
  panBy: (delta: Point) => void;
  zoomAt: (point: Point, zoom: number) => void;
  reset: () => void;
  fit: (bounds: Bounds | null, size: { width: number; height: number }) => void;
};

export const useViewportStore = create<ViewportStore>((set) => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  setViewport: (viewport) => set({ viewport }),
  panBy: (delta) => set((s) => ({ viewport: { ...s.viewport, x: s.viewport.x + delta.x, y: s.viewport.y + delta.y } })),
  zoomAt: (point, zoom) => set((s) => ({ viewport: zoomAt(s.viewport, point, zoom) })),
  reset: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),
  fit: (bounds, size) => {
    if (!bounds) return set({ viewport: { x: size.width / 2, y: size.height / 2, zoom: 1 } });
    const padding = 96;
    const zoom = Math.min(2, Math.max(0.1, Math.min((size.width - padding * 2) / Math.max(bounds.width, 1), (size.height - padding * 2) / Math.max(bounds.height, 1))));
    set({ viewport: { zoom, x: size.width / 2 - (bounds.x + bounds.width / 2) * zoom, y: size.height / 2 - (bounds.y + bounds.height / 2) * zoom } });
  },
}));
