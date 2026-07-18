import type { CanvasElement } from "@/core/elements/types";
import { cloneBoardData } from "@/lib/browser/clone-board-data";

const MIME = "draftspace/selection";
let fallback: CanvasElement[] = [];

export async function copyElements(elements: CanvasElement[]) {
  fallback = cloneBoardData(elements);
  try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(JSON.stringify({ fileFormat: MIME, elements })); } catch { /* Session fallback remains available. */ }
}

export async function readElements(): Promise<CanvasElement[]> {
  try {
    if (!navigator.clipboard?.readText) throw new Error("Clipboard API unavailable");
    const parsed = JSON.parse(await navigator.clipboard.readText()) as { fileFormat?: string; elements?: CanvasElement[] };
    if (parsed.fileFormat === MIME && Array.isArray(parsed.elements)) return parsed.elements;
  } catch { /* Use session fallback. */ }
  return cloneBoardData(fallback);
}
