import type { CanvasElement, Connector } from "@/core/elements/types";
import { cloneBoardData } from "@/lib/browser/clone-board-data";

export type ClipboardSelection = { elements: CanvasElement[]; connectors: Connector[] };

const MIME = "draftspace/selection";
let fallback: ClipboardSelection = { elements: [], connectors: [] };

export async function copyElements(elements: CanvasElement[], connectors: Connector[] = []) {
  fallback = cloneBoardData({ elements, connectors });
  try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(JSON.stringify({ fileFormat: MIME, elements, connectors })); } catch { /* Session fallback remains available. */ }
}

export async function readElements(): Promise<ClipboardSelection> {
  try {
    if (!navigator.clipboard?.readText) throw new Error("Clipboard API unavailable");
    const parsed = JSON.parse(await navigator.clipboard.readText()) as { fileFormat?: string; elements?: CanvasElement[]; connectors?: Connector[] };
    // Payloads written before connectors travelled on the clipboard carry elements only.
    if (parsed.fileFormat === MIME && Array.isArray(parsed.elements)) return { elements: parsed.elements, connectors: Array.isArray(parsed.connectors) ? parsed.connectors : [] };
  } catch { /* Use session fallback. */ }
  return cloneBoardData(fallback);
}
