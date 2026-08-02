import type { BoardDocument, Viewport } from "@/core/board/types";
import type { Bounds, CanvasElement, Connector, Point, ShapeType } from "@/core/elements/types";
import { connectorPolyline } from "@/core/connectors/routing";
import { shapePath } from "./shape-path";

export interface ShapeDraft { type: ShapeType; bounds: Bounds }

export interface RenderSceneInput {
  context: CanvasRenderingContext2D;
  board: BoardDocument;
  viewport: Viewport;
  elements: CanvasElement[];
  canvasSize: { width: number; height: number };
  draftShape: ShapeDraft | null;
}

export interface RenderSceneResult { renderedElementCount: number }

const CONNECTOR_DASH: Record<Connector["kind"], number[]> = { sync: [], async: [9, 7], data: [2, 5] };

function drawConnector(context: CanvasRenderingContext2D, board: BoardDocument, connector: Connector): void {
  const points = connectorPolyline(board, connector);
  if (!points || points.length < 2) return;
  context.globalAlpha = 1;
  context.strokeStyle = connector.strokeColor;
  context.lineWidth = connector.strokeWidth;
  context.lineJoin = "round";
  context.setLineDash(CONNECTOR_DASH[connector.kind]);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.stroke();
  context.setLineDash([]);
  drawArrowhead(context, points[points.length - 2], points[points.length - 1], connector.strokeColor);
  if (connector.label) {
    const middle = points[Math.floor(points.length / 2)];
    context.fillStyle = "#6b6459";
    context.font = "600 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(connector.label, middle.x, middle.y - 4);
  }
}

function drawArrowhead(context: CanvasRenderingContext2D, fromPoint: Point, tip: Point, color: string): void {
  const angle = Math.atan2(tip.y - fromPoint.y, tip.x - fromPoint.x);
  const size = 9;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - size * Math.cos(angle - Math.PI / 6), tip.y - size * Math.sin(angle - Math.PI / 6));
  context.lineTo(tip.x - size * Math.cos(angle + Math.PI / 6), tip.y - size * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

export function renderScene({ context, board, viewport, elements, canvasSize, draftShape }: RenderSceneInput): RenderSceneResult {
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
  for (const connectorId of board.connectorIds) {
    const connector = board.connectors[connectorId];
    if (connector) drawConnector(context, board, connector);
  }
  let renderedElementCount = 0;
  for (const element of elements) {
    if (element.hidden) continue;
    renderedElementCount += 1;
    context.globalAlpha = element.opacity;
    context.fillStyle = element.fillColor ?? "transparent";
    context.strokeStyle = element.strokeColor;
    context.lineWidth = element.strokeWidth;
    context.setLineDash(element.strokeStyle === "dashed" ? [8, 6] : element.strokeStyle === "dotted" ? [2, 5] : []);
    shapePath(context, element.type, element, element.type === "rectangle" ? element.cornerRadius : 0);
    if (element.fillColor) context.fill();
    context.stroke();
    if (element.label) {
      context.setLineDash([]);
      context.fillStyle = "#292724";
      context.font = "600 13px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(element.label, element.x + element.width / 2, element.y + element.height / 2, Math.max(element.width - 12, 24));
    }
  }
  if (draftShape) {
    context.globalAlpha = .72;
    context.fillStyle = "#ead9cc";
    context.strokeStyle = "#b85f3f";
    context.lineWidth = 2 / viewport.zoom;
    context.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
    shapePath(context, draftShape.type, draftShape.bounds, draftShape.type === "rectangle" ? 10 : 0);
    context.fill(); context.stroke();
  }
  context.restore();
  return { renderedElementCount };
}
