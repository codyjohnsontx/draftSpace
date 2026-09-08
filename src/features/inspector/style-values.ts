import type { CanvasElement, Connector, ShapeStylePatch } from "@/core/elements/types";
import type { ConnectorStylePreview, StylePreview } from "@/stores/session-store";

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

export type PaletteSwatch = { name: string; value: string };

export const swatchName = (color: string, kind: "recent" | "custom") =>
  CURATED_COLORS.find(({ value }) => value.toLowerCase() === color.toLowerCase())?.name ?? `${kind} color ${color.toLowerCase()}`;

/**
 * The colours a compact control puts on show: the palette's first six, except that a colour
 * the selection already carries always takes the last slot. Without that swap, a shape styled
 * from the far end of the palette would show no pressed chip at all and the control could not
 * say what it was set to.
 */
export function quickColors(current: string | null | undefined, recentColors: readonly string[]): PaletteSwatch[] {
  const quick: PaletteSwatch[] = CURATED_COLORS.slice(0, 6).map(({ name, value }) => ({ name, value }));
  if (!current || quick.some(({ value }) => value.toLowerCase() === current.toLowerCase())) return quick;
  const recent = recentColors.some((color) => color.toLowerCase() === current.toLowerCase());
  return [...quick.slice(0, -1), { name: swatchName(current, recent ? "recent" : "custom"), value: current }];
}

/**
 * Everything the compact control did not have room for, so the two together are always the whole
 * palette plus every recent colour - this is a disclosure, never a smaller set of colours.
 */
export function overflowColors(quick: readonly PaletteSwatch[], recentColors: readonly string[]): PaletteSwatch[] {
  const shown = new Set(quick.map(({ value }) => value.toLowerCase()));
  const rest: PaletteSwatch[] = [];
  for (const { name, value } of CURATED_COLORS) if (!shown.has(value.toLowerCase())) rest.push({ name, value });
  for (const color of recentColors) if (!shown.has(color.toLowerCase())) rest.push({ name: swatchName(color, "recent"), value: color });
  return rest;
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

/** What a group of styled things (elements or edges) agrees on for one property. */
export function sharedValue<Item, T>(items: readonly Item[], select: (item: Item) => T): SharedValue<T> {
  if (!items.length) return { kind: "unavailable" };
  const representative = select(items[0]);
  return items.every((item) => Object.is(select(item), representative))
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

/** An edge as a preview would draw it. Returns the stored edge itself when the preview does not cover it, so an unaffected edge stays referentially stable. */
export function applyConnectorPreview(connector: Connector, preview: ConnectorStylePreview | null): Connector {
  return preview?.connectorIds.includes(connector.id) ? { ...connector, ...preview.patch } : connector;
}
