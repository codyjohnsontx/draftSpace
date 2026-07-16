import type { CanvasElement } from "@/core/elements/types";

const MIME = "draftspace/selection";
let fallback: CanvasElement[] = [];

export async function copyElements(elements: CanvasElement[]) {
  fallback = structuredClone(elements);
  try { await navigator.clipboard.writeText(JSON.stringify({ fileFormat: MIME, elements })); } catch { /* Session fallback remains available. */ }
}

export async function readElements(): Promise<CanvasElement[]> {
  try {
    const parsed = JSON.parse(await navigator.clipboard.readText()) as { fileFormat?: string; elements?: CanvasElement[] };
    if (parsed.fileFormat === MIME && Array.isArray(parsed.elements)) return parsed.elements;
  } catch { /* Use session fallback. */ }
  return structuredClone(fallback);
}
