"use client";

import { useEffect, useRef } from "react";
import type { BoardDocument, Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement } from "@/core/elements/types";

type Props = {
  board: BoardDocument;
  viewport: Viewport;
  elements: CanvasElement[];
  width: number;
  height: number;
  draftRectangle: Bounds | null;
};

export function SceneCanvas({ board, viewport, elements, width, height, draftRectangle }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current; if (!canvas || width <= 0 || height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f7f4ed"; ctx.fillRect(0, 0, width, height);

    const { backgroundPattern, gridSize } = board.preferences;
    if (backgroundPattern !== "none") {
      const spacing = gridSize * viewport.zoom;
      if (spacing >= 7) {
        const ox = ((viewport.x % spacing) + spacing) % spacing;
        const oy = ((viewport.y % spacing) + spacing) % spacing;
        ctx.strokeStyle = "rgba(70, 65, 58, .11)"; ctx.fillStyle = "rgba(70, 65, 58, .20)"; ctx.lineWidth = 1;
        if (backgroundPattern === "dots") {
          for (let x = ox; x < width; x += spacing) for (let y = oy; y < height; y += spacing) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
        } else {
          ctx.beginPath();
          for (let x = ox; x < width; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
          for (let y = oy; y < height; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
          ctx.stroke();
        }
      }
    }

    ctx.save(); ctx.translate(viewport.x, viewport.y); ctx.scale(viewport.zoom, viewport.zoom);
    for (const element of elements) {
      if (element.hidden) continue;
      ctx.globalAlpha = element.opacity;
      ctx.fillStyle = element.fillColor ?? "transparent"; ctx.strokeStyle = element.strokeColor; ctx.lineWidth = element.strokeWidth;
      ctx.setLineDash(element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 5] : []);
      ctx.beginPath(); ctx.roundRect(element.x, element.y, element.width, element.height, Math.min(element.cornerRadius, element.width / 2, element.height / 2));
      if (element.fillColor) ctx.fill(); ctx.stroke();
    }
    if (draftRectangle) {
      ctx.globalAlpha = .72; ctx.fillStyle = "#ead9cc"; ctx.strokeStyle = "#b85f3f"; ctx.lineWidth = 2 / viewport.zoom; ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
      ctx.beginPath(); ctx.roundRect(draftRectangle.x, draftRectangle.y, draftRectangle.width, draftRectangle.height, 10); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }, [board.preferences, draftRectangle, elements, height, viewport, width]);

  return <canvas ref={ref} className="scene-canvas" aria-hidden="true" />;
}
