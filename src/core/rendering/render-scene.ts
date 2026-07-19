import type { BoardDocument, Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement } from "@/core/elements/types";
import { roundedRectPath } from "@/lib/browser/rounded-rect-path";

export interface RenderSceneInput {
  context: CanvasRenderingContext2D;
  board: BoardDocument;
  viewport: Viewport;
  elements: CanvasElement[];
  canvasSize: { width: number; height: number };
  draftRectangle: Bounds | null;
}

export interface RenderSceneResult { renderedElementCount: number }

export function renderScene({ context, board, viewport, elements, canvasSize, draftRectangle }: RenderSceneInput): RenderSceneResult {
  const { width, height } = canvasSize;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f4ed";
  context.fillRect(0, 0, width, height);

  const { backgroundPattern, gridSize } = board.preferences;
  if (backgroundPattern !== "none") {
    const spacing = gridSize * viewport.zoom;
    if (spacing >= 7) {
      const offsetX = ((viewport.x % spacing) + spacing) % spacing;
      const offsetY = ((viewport.y % spacing) + spacing) % spacing;
      context.strokeStyle = "rgba(70, 65, 58, .11)";
      context.fillStyle = "rgba(70, 65, 58, .20)";
      context.lineWidth = 1;
      if (backgroundPattern === "dots") {
        for (let x = offsetX; x < width; x += spacing) {
          for (let y = offsetY; y < height; y += spacing) {
            context.beginPath(); context.arc(x, y, 1, 0, Math.PI * 2); context.fill();
          }
        }
      } else {
        context.beginPath();
        for (let x = offsetX; x < width; x += spacing) { context.moveTo(x, 0); context.lineTo(x, height); }
        for (let y = offsetY; y < height; y += spacing) { context.moveTo(0, y); context.lineTo(width, y); }
        context.stroke();
      }
    }
  }

  context.save();
  context.translate(viewport.x, viewport.y);
  context.scale(viewport.zoom, viewport.zoom);
  let renderedElementCount = 0;
  for (const element of elements) {
    if (element.hidden) continue;
    renderedElementCount += 1;
    context.globalAlpha = element.opacity;
    context.fillStyle = element.fillColor ?? "transparent";
    context.strokeStyle = element.strokeColor;
    context.lineWidth = element.strokeWidth;
    context.setLineDash(element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 5] : []);
    roundedRectPath(context, element.x, element.y, element.width, element.height, element.cornerRadius);
    if (element.fillColor) context.fill();
    context.stroke();
  }
  if (draftRectangle) {
    context.globalAlpha = .72;
    context.fillStyle = "#ead9cc";
    context.strokeStyle = "#b85f3f";
    context.lineWidth = 2 / viewport.zoom;
    context.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
    roundedRectPath(context, draftRectangle.x, draftRectangle.y, draftRectangle.width, draftRectangle.height, 10);
    context.fill(); context.stroke();
  }
  context.restore();
  return { renderedElementCount };
}
