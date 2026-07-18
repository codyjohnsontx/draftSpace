export interface BrowserCapabilities {
  canvas2d: boolean;
  resizeObserver: boolean;
  structuredClone: boolean;
  randomUUID: boolean;
  roundedRect: boolean;
  clipboard: boolean;
  blobDownload: boolean;
  serviceWorker: boolean;
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try { context = canvas?.getContext("2d") ?? null; } catch { context = null; }
  return {
    canvas2d: context !== null,
    resizeObserver: typeof globalThis.ResizeObserver === "function",
    structuredClone: typeof globalThis.structuredClone === "function",
    randomUUID: typeof globalThis.crypto?.randomUUID === "function",
    roundedRect: typeof context?.roundRect === "function",
    clipboard: typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function" && typeof navigator.clipboard?.writeText === "function",
    blobDownload: typeof Blob === "function" && typeof URL?.createObjectURL === "function",
    serviceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  };
}
