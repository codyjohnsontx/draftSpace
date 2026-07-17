export type WheelIntent = "pan" | "zoom";

export function classifyWheelGesture(input: { ctrlKey: boolean; metaKey: boolean; deltaMode: number; deltaX: number; deltaY: number }): WheelIntent {
  if (input.ctrlKey || input.metaKey) return "zoom";
  if (input.deltaMode !== 0) return "zoom";
  const looksLikeWheelNotch = Math.abs(input.deltaX) < 1 && Math.abs(input.deltaY) >= 40;
  return looksLikeWheelNotch ? "zoom" : "pan";
}
