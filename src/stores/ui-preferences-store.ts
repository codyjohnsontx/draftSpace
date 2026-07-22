import { create } from "zustand";
import { normalizeHexColor, updateRecentColors } from "@/features/inspector/style-values";

export type InspectorMode = "floating" | "sidebar" | "hidden";
export type VisibleInspectorMode = Exclude<InspectorMode, "hidden">;

export interface InspectorPreferences {
  schemaVersion: 1;
  mode: InspectorMode;
  lastVisibleMode: VisibleInspectorMode;
  recentColors: string[];
}

export const INSPECTOR_PREFERENCES_KEY = "draftspace:inspector-preferences";
export const DEFAULT_INSPECTOR_PREFERENCES: InspectorPreferences = {
  schemaVersion: 1,
  mode: "floating",
  lastVisibleMode: "floating",
  recentColors: [],
};

const modes = new Set<InspectorMode>(["floating", "sidebar", "hidden"]);
const visibleModes = new Set<VisibleInspectorMode>(["floating", "sidebar"]);

export function parseInspectorPreferences(value: string | null): InspectorPreferences {
  if (!value) return { ...DEFAULT_INSPECTOR_PREFERENCES };
  try {
    const parsed = JSON.parse(value) as Partial<InspectorPreferences>;
    if (parsed.schemaVersion !== 1 || !modes.has(parsed.mode as InspectorMode) || !visibleModes.has(parsed.lastVisibleMode as VisibleInspectorMode)) return { ...DEFAULT_INSPECTOR_PREFERENCES };
    const recentColors = Array.isArray(parsed.recentColors)
      ? parsed.recentColors.map((color) => typeof color === "string" ? normalizeHexColor(color) : null).filter((color): color is string => Boolean(color)).filter((color, index, list) => list.indexOf(color) === index).slice(0, 6)
      : [];
    return { schemaVersion: 1, mode: parsed.mode as InspectorMode, lastVisibleMode: parsed.lastVisibleMode as VisibleInspectorMode, recentColors };
  } catch {
    return { ...DEFAULT_INSPECTOR_PREFERENCES };
  }
}

function persist(preferences: InspectorPreferences) {
  try { localStorage.setItem(INSPECTOR_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* UI preferences remain in memory. */ }
}

type UiPreferencesStore = {
  hydrated: boolean;
  inspector: InspectorPreferences;
  hydrate: () => void;
  setInspectorMode: (mode: InspectorMode) => void;
  showInspector: () => void;
  recordRecentColor: (color: string) => void;
};

export const useUiPreferencesStore = create<UiPreferencesStore>((set, get) => ({
  hydrated: false,
  inspector: { ...DEFAULT_INSPECTOR_PREFERENCES },
  hydrate: () => {
    if (get().hydrated) return;
    let inspector = { ...DEFAULT_INSPECTOR_PREFERENCES };
    try { inspector = parseInspectorPreferences(localStorage.getItem(INSPECTOR_PREFERENCES_KEY)); } catch { /* Defaults remain active. */ }
    set({ hydrated: true, inspector });
  },
  setInspectorMode: (mode) => set((state) => {
    const inspector = { ...state.inspector, mode, lastVisibleMode: mode === "hidden" ? state.inspector.lastVisibleMode : mode };
    persist(inspector);
    return { inspector };
  }),
  showInspector: () => get().setInspectorMode(get().inspector.lastVisibleMode),
  recordRecentColor: (color) => set((state) => {
    const inspector = { ...state.inspector, recentColors: updateRecentColors(state.inspector.recentColors, color) };
    persist(inspector);
    return { inspector };
  }),
}));
