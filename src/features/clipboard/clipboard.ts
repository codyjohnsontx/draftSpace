import type { CanvasElement, Connector } from "@/core/elements/types";
import type { SelectionCopy } from "@/core/board/duplicate";
import { canvasElementSchema, connectorSchema } from "@/schemas/board-schema";
import { cloneBoardData } from "@/lib/browser/clone-board-data";

const MIME = "draftspace/selection";
let fallback: SelectionCopy = { elements: [], connectors: [] };

/**
 * The clipboard is untrusted input: text can come from another draftspace build
 * or be hand-crafted. Entries that do not match the board schema are dropped
 * individually so one malformed connector cannot abort a paste of valid shapes.
 */
function parseSelection(value: unknown): SelectionCopy | null {
  if (typeof value !== "object" || value === null) return null;
  const payload = value as { fileFormat?: unknown; elements?: unknown; connectors?: unknown };
  if (payload.fileFormat !== MIME || !Array.isArray(payload.elements)) return null;
  const elements = payload.elements.flatMap((entry) => {
    const parsed = canvasElementSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  // Payloads written before connectors travelled on the clipboard carry elements only.
  const connectors = Array.isArray(payload.connectors) ? payload.connectors.flatMap((entry) => {
    const parsed = connectorSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  }) : [];
  return { elements, connectors };
}

export async function copyElements(elements: CanvasElement[], connectors: Connector[] = []) {
  fallback = cloneBoardData({ elements, connectors });
  try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(JSON.stringify({ fileFormat: MIME, elements, connectors })); } catch { /* Session fallback remains available. */ }
}

export async function readElements(): Promise<SelectionCopy> {
  try {
    if (!navigator.clipboard?.readText) throw new Error("Clipboard API unavailable");
    const selection = parseSelection(JSON.parse(await navigator.clipboard.readText()));
    if (selection) return selection;
  } catch { /* Use session fallback. */ }
  return cloneBoardData(fallback);
}
