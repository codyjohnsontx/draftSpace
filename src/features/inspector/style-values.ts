import type { CanvasElement, ShapeStylePatch } from "@/core/elements/types";
import type { StylePreview } from "@/stores/session-store";

export type SharedValue<T> =
  | { kind: "value"; value: T }
  | { kind: "mixed"; representative: T }
  | { kind: "unavailable" };

export const CURATED_COLORS = [
  { name: "Ink", value: "#292724" },
  { name: "White", value: "#fffdfa" },
  { name: "Sand", value: "#f4eadf" },
  { name: "Terracotta", value: "#b85f3f" },
  { name: "Coral", value: "#d97757" },
  { name: "Gold", value: "#d4a72c" },
  { name: "Sage", value: "#6f8f72" },
  { name: "Teal", value: "#3f7f78" },
  { name: "Blue", value: "#4f6fa8" },
  { name: "Plum", value: "#7b5f86" },
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}

export function updateRecentColors(colors: readonly string[], nextColor: string, limit = 6): string[] {
  const normalized = normalizeHexColor(nextColor);
  if (!normalized) return [...colors];
  return [normalized, ...colors.map((color) => normalizeHexColor(color)).filter((color): color is string => Boolean(color) && color !== normalized)].slice(0, limit);
}

export function visibleRecentColors(colors: readonly string[]): string[] {
  const curated = new Set(CURATED_COLORS.map(({ value }) => value.toLowerCase()));
  return colors.filter((color) => !curated.has(color.toLowerCase()));
}

export function sharedValue<T>(elements: readonly CanvasElement[], select: (element: CanvasElement) => T): SharedValue<T> {
  if (!elements.length) return { kind: "unavailable" };
  const representative = select(elements[0]);
  return elements.every((element) => Object.is(select(element), representative))
    ? { kind: "value", value: representative }
    : { kind: "mixed", representative };
}

export function applyStylePatch(element: CanvasElement, patch: ShapeStylePatch): CanvasElement {
  const next = { ...element } as CanvasElement;
  if (patch.fillColor !== undefined) next.fillColor = patch.fillColor;
  if (patch.strokeColor !== undefined) next.strokeColor = patch.strokeColor;
  if (patch.strokeWidth !== undefined) next.strokeWidth = patch.strokeWidth;
  if (patch.strokeStyle !== undefined) next.strokeStyle = patch.strokeStyle;
  if (patch.opacity !== undefined) next.opacity = patch.opacity;
  if (patch.cornerRadius !== undefined && next.type === "rectangle") next.cornerRadius = patch.cornerRadius;
  return next;
}

export function applyStylePreview(element: CanvasElement, preview: StylePreview | null, previewIds?: ReadonlySet<string>): CanvasElement {
  const applies = preview && (previewIds ? previewIds.has(element.id) : preview.elementIds.includes(element.id));
  return applies ? applyStylePatch(element, preview.patch) : element;
}
