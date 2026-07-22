import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoard, createShape } from "@/core/board/factory";
import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement } from "@/core/elements/types";
import { StyleInspector } from "@/components/inspector/style-inspector";
import { applyStylePreview, sharedValue, updateRecentColors, visibleRecentColors } from "@/features/inspector/style-values";
import { emptyHistory } from "@/features/history/history";
import { useBoardStore } from "@/stores/board-store";
import { useSessionStore } from "@/stores/session-store";
import { DEFAULT_INSPECTOR_PREFERENCES, parseInspectorPreferences, useUiPreferencesStore } from "@/stores/ui-preferences-store";

function boardWithShapes(): { board: BoardDocument; rectangle: CanvasElement; ellipse: CanvasElement } {
  const board = createBoard("Inspector test");
  const rectangle = createShape("rectangle", { x: 20, y: 20, width: 160, height: 100 });
  const ellipse = createShape("ellipse", { x: 220, y: 20, width: 160, height: 100 });
  board.elementIds = [rectangle.id, ellipse.id];
  board.elements = { [rectangle.id]: rectangle, [ellipse.id]: ellipse };
  return { board, rectangle, ellipse };
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  useBoardStore.setState({ board: null, history: emptyHistory(), revision: 0 });
  useSessionStore.setState({ selectedIds: [], stylePreview: null });
  useUiPreferencesStore.setState({ hydrated: true, inspector: { ...DEFAULT_INSPECTOR_PREFERENCES } });
});

afterEach(() => {
  useSessionStore.setState({ selectedIds: [], stylePreview: null });
  vi.unstubAllGlobals();
});

describe("style values", () => {
  it("reports shared, mixed, and unavailable values", () => {
    const { rectangle, ellipse } = boardWithShapes();
    expect(sharedValue([], (element) => element.opacity)).toEqual({ kind: "unavailable" });
    expect(sharedValue([rectangle, ellipse], (element) => element.strokeWidth)).toEqual({ kind: "value", value: 2 });
    const changed = { ...ellipse, strokeWidth: 4 };
    expect(sharedValue([rectangle, changed], (element) => element.strokeWidth)).toEqual({ kind: "mixed", representative: 2 });
  });

  it("applies session previews without mutating the source element", () => {
    const { rectangle } = boardWithShapes();
    const result = applyStylePreview(rectangle, { elementIds: [rectangle.id], patch: { opacity: .4, cornerRadius: 32 } });
    expect(result).not.toBe(rectangle);
    expect(result.opacity).toBe(.4);
    expect(result.type === "rectangle" && result.cornerRadius).toBe(32);
    expect(rectangle.opacity).toBe(1);
  });

  it("normalizes, deduplicates, caps, and filters recent colors", () => {
    let recent: string[] = [];
    for (const color of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#111111"]) recent = updateRecentColors(recent, color);
    expect(recent).toEqual(["#111111", "#777777", "#666666", "#555555", "#444444", "#333333"]);
    expect(visibleRecentColors(["#B85F3F", "#123456"])).toEqual(["#123456"]);
  });
});

describe("inspector preferences", () => {
  it("validates stored preferences and falls back safely", () => {
    expect(parseInspectorPreferences(null)).toEqual(DEFAULT_INSPECTOR_PREFERENCES);
    expect(parseInspectorPreferences("not json")).toEqual(DEFAULT_INSPECTOR_PREFERENCES);
    expect(parseInspectorPreferences(JSON.stringify({ schemaVersion: 2, mode: "sidebar" }))).toEqual(DEFAULT_INSPECTOR_PREFERENCES);
    expect(parseInspectorPreferences(JSON.stringify({ schemaVersion: 1, mode: "sidebar", lastVisibleMode: "sidebar", recentColors: ["#ABCDEF", "bad", "#abcdef"] }))).toEqual({ schemaVersion: 1, mode: "sidebar", lastVisibleMode: "sidebar", recentColors: ["#abcdef"] });
  });

  it("remembers the last visible mode when hidden", () => {
    useUiPreferencesStore.getState().setInspectorMode("sidebar");
    useUiPreferencesStore.getState().setInspectorMode("hidden");
    expect(useUiPreferencesStore.getState().inspector).toMatchObject({ mode: "hidden", lastVisibleMode: "sidebar" });
    useUiPreferencesStore.getState().showInspector();
    expect(useUiPreferencesStore.getState().inspector.mode).toBe("sidebar");
  });

  it("keeps in-memory defaults and changes when local storage fails", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("unavailable"); },
      setItem: () => { throw new Error("unavailable"); },
    });
    useUiPreferencesStore.setState({ hydrated: false, inspector: { ...DEFAULT_INSPECTOR_PREFERENCES } });
    useUiPreferencesStore.getState().hydrate();
    expect(useUiPreferencesStore.getState()).toMatchObject({ hydrated: true, inspector: DEFAULT_INSPECTOR_PREFERENCES });
    useUiPreferencesStore.getState().setInspectorMode("sidebar");
    expect(useUiPreferencesStore.getState().inspector.mode).toBe("sidebar");
  });
});

describe("style history", () => {
  it("styles multiple shapes in one undoable transaction and limits corners to rectangles", () => {
    const { board, rectangle, ellipse } = boardWithShapes();
    useBoardStore.getState().setBoard(board);
    useBoardStore.getState().applyElementStyles([rectangle.id, ellipse.id], { fillColor: "#4f6fa8", cornerRadius: 40 });
    const changed = useBoardStore.getState();
    expect(changed.history.undo).toHaveLength(1);
    expect(changed.board?.elements[rectangle.id].fillColor).toBe("#4f6fa8");
    expect(changed.board?.elements[ellipse.id].fillColor).toBe("#4f6fa8");
    const changedRectangle = changed.board?.elements[rectangle.id];
    expect(changedRectangle?.type === "rectangle" && changedRectangle.cornerRadius).toBe(40);
    expect(changed.board?.elements[ellipse.id]).not.toHaveProperty("cornerRadius");
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().board?.elements[rectangle.id].fillColor).toBe("#f4eadf");
    useBoardStore.getState().redo();
    expect(useBoardStore.getState().board?.elements[rectangle.id].fillColor).toBe("#4f6fa8");
  });

  it("does not create history for inapplicable style changes or without a board", () => {
    useBoardStore.getState().applyElementStyles(["missing"], { opacity: .5 });
    expect(useBoardStore.getState().history.undo).toHaveLength(0);
    const { board, rectangle, ellipse } = boardWithShapes();
    useBoardStore.getState().setBoard(board);
    useBoardStore.getState().applyElementStyles([rectangle.id], {});
    useBoardStore.getState().applyElementStyles(["missing"], { opacity: .5 });
    useBoardStore.getState().applyElementStyles([ellipse.id], { cornerRadius: 20 });
    useBoardStore.getState().applyElementStyles([rectangle.id], { opacity: 1 });
    expect(useBoardStore.getState().history.undo).toHaveLength(0);
    expect(useBoardStore.getState().revision).toBe(0);
  });
});

describe("StyleInspector", () => {
  it("stays out of the way in floating mode and shows a sidebar empty state", () => {
    const { board } = boardWithShapes();
    useBoardStore.getState().setBoard(board);
    const view = render(<StyleInspector />);
    expect(screen.queryByRole("toolbar", { name: "Style inspector" })).not.toBeInTheDocument();
    useUiPreferencesStore.getState().setInspectorMode("sidebar");
    view.rerender(<StyleInspector />);
    expect(screen.getByRole("complementary", { name: "Style inspector" })).toBeVisible();
    expect(screen.getByText("Select a shape to edit its style.")).toBeVisible();
  });

  it("shows mixed values, applies a shared value, and exposes button types", () => {
    const { board, rectangle, ellipse } = boardWithShapes();
    board.elements[ellipse.id] = { ...ellipse, strokeWidth: 4 };
    useBoardStore.getState().setBoard(board);
    useSessionStore.getState().setSelected([rectangle.id, ellipse.id]);
    render(<StyleInspector />);
    expect(screen.getByText("2 mixed shapes")).toBeVisible();
    expect(screen.getByText("Mixed")).toBeVisible();
    const widthButton = screen.getByRole("button", { name: "Set stroke width to 8" });
    expect(widthButton).toHaveAttribute("type", "button");
    fireEvent.click(widthButton);
    expect(useBoardStore.getState().board?.elements[rectangle.id].strokeWidth).toBe(8);
    expect(useBoardStore.getState().board?.elements[ellipse.id].strokeWidth).toBe(8);
    expect(useBoardStore.getState().history.undo).toHaveLength(1);
  });

  it("previews a slider without history and commits once on completion", () => {
    const { board, rectangle } = boardWithShapes();
    useBoardStore.getState().setBoard(board);
    useSessionStore.getState().setSelected([rectangle.id]);
    render(<StyleInspector />);
    const opacity = screen.getByRole("slider", { name: "Opacity" });
    fireEvent.change(opacity, { target: { value: "45" } });
    expect(useSessionStore.getState().stylePreview?.patch.opacity).toBe(.45);
    expect(useBoardStore.getState().board?.elements[rectangle.id].opacity).toBe(1);
    expect(useBoardStore.getState().history.undo).toHaveLength(0);
    fireEvent.pointerUp(opacity);
    expect(useSessionStore.getState().stylePreview).toBeNull();
    expect(useBoardStore.getState().board?.elements[rectangle.id].opacity).toBe(.45);
    expect(useBoardStore.getState().history.undo).toHaveLength(1);
  });
});
