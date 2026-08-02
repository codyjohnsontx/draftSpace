import { describe, expect, it } from "vitest";
import { createBoard } from "@/core/board/factory";
import { loadBoardDocument } from "@/features/persistence/load-board-document";

const versionOneBoard = () => ({
  fileFormat: "draftspace/board" as const,
  schemaVersion: 1 as const,
  id: "legacy-board",
  name: "Legacy board",
  createdAt: "2025-01-02T03:04:05.000Z",
  updatedAt: "2025-01-02T03:04:05.000Z",
  viewport: { x: 12, y: -8, zoom: 1.25 },
  preferences: { backgroundPattern: "dots" as const, gridSize: 20, snapToGrid: false, restoreViewport: true },
  elementIds: ["legacy-rectangle"],
  elements: {
    "legacy-rectangle": {
      id: "legacy-rectangle", type: "rectangle" as const, x: 10, y: 20, width: 100, height: 60,
      rotation: 0, groupIds: [], locked: false, hidden: false, opacity: 1,
      strokeColor: "#292724", strokeWidth: 2, strokeStyle: "solid" as const,
      fillColor: "#f4eadf", fillStyle: "solid" as const, roughness: 0, cornerRadius: 10,
      boundTextId: null, createdAt: "2025-01-02T03:04:05.000Z", updatedAt: "2025-01-02T03:04:05.000Z",
    },
  },
});

describe("stored board loading", () => {
  it("returns missing for an empty record", () => expect(loadBoardDocument("board", null)).toEqual({ kind: "missing" }));
  it("loads a current board without migration", () => { const board = createBoard(); expect(loadBoardDocument(board.id, board)).toEqual({ kind: "ready", board, migrated: false }); });
  it("migrates a version one rectangle board without mutating the raw record", () => {
    const raw = versionOneBoard(); const before = structuredClone(raw);
    const migratedElement = { ...raw.elements["legacy-rectangle"], nodeKind: "plain", layer: 0, label: "" };
    expect(loadBoardDocument(raw.id, raw)).toEqual({
      kind: "ready",
      board: { ...raw, schemaVersion: 3, elements: { "legacy-rectangle": migratedElement }, connectorIds: [], connectors: {} },
      migrated: true,
    });
    expect(raw).toEqual(before);
  });
  it("rejects malformed version one boards without migration", () => {
    const raw = versionOneBoard(); raw.elements["legacy-rectangle"].width = -1;
    const result = loadBoardDocument(raw.id, raw);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.raw).toBe(raw);
  });
  it("rejects non-rectangle elements in version one boards", () => {
    const legacy = versionOneBoard();
    const raw = { ...legacy, elements: { "legacy-rectangle": { ...legacy.elements["legacy-rectangle"], type: "ellipse" } } };
    const result = loadBoardDocument(raw.id, raw);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.raw).toBe(raw);
  });
  it("preserves invalid raw data and limits issue output", () => {
    const raw = { id: "damaged", fileFormat: "wrong", schemaVersion: 1 };
    const result = loadBoardDocument("damaged", raw);
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") { expect(result.raw).toBe(raw); expect(result.issues.length).toBeLessThanOrEqual(3); }
  });
  it("separates unsupported future versions", () => {
    const raw = { id: "future", fileFormat: "draftspace/board", schemaVersion: 9 };
    expect(loadBoardDocument("future", raw)).toEqual({ kind: "unsupported-version", boardId: "future", raw, schemaVersion: 9 });
  });
});
