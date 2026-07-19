import type { BoardDocument } from "@/core/board/types";
import type { CanvasElement } from "@/core/elements/types";

type JsonSafeDraftspaceData = BoardDocument | CanvasElement | CanvasElement[];

export function cloneBoardData<T extends JsonSafeDraftspaceData>(value: T): T {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
