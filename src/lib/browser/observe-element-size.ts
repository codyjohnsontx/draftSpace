export type ElementSize = { width: number; height: number };

export function observeElementSize(element: HTMLElement, onSize: (size: ElementSize) => void): () => void {
  const measure = () => {
    const bounds = element.getBoundingClientRect();
    onSize({ width: bounds.width, height: bounds.height });
  };
  measure();
  if (typeof globalThis.ResizeObserver === "function") {
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }
  window.addEventListener("resize", measure);
  return () => window.removeEventListener("resize", measure);
}
