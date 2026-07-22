"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { Ban, Pipette } from "lucide-react";
import { CURATED_COLORS, type SharedValue } from "@/features/inspector/style-values";

type ColorValue = SharedValue<string | null>;

export function ColorControl({ label, value, allowNone, recentColors, onSelect, onPreview, onCommit, onCancel }: {
  label: "Fill" | "Stroke";
  value: ColorValue;
  allowNone?: boolean;
  recentColors: readonly string[];
  onSelect: (color: string | null) => void;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel: () => void;
}) {
  const selected = value.kind === "value" ? value.value : undefined;
  const representative = value.kind === "mixed" ? value.representative : selected;
  const customValue = typeof representative === "string" && /^#[0-9a-f]{6}$/i.test(representative) ? representative : "#b85f3f";
  const lowerLabel = label.toLowerCase();
  const swatch = (name: string, color: string) => <button key={`${label}-${color}`} type="button" className="color-swatch" style={{ "--swatch-color": color } as CSSProperties} aria-label={`Set ${lowerLabel} to ${name}`} aria-pressed={selected?.toLowerCase() === color.toLowerCase()} onClick={() => onSelect(color)}><span /></button>;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); event.currentTarget.blur(); }
    if (event.key === "Enter") { onCommit(event.currentTarget.value); event.currentTarget.blur(); }
  };

  return <fieldset className="inspector-group color-group">
    <legend>{label}{value.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend>
    <div className="color-row" aria-label={`${label} colors`}>
      {allowNone && <button type="button" className="color-swatch none-swatch" aria-label="Remove fill" aria-pressed={selected === null} onClick={() => onSelect(null)}><Ban size={13} /></button>}
      {CURATED_COLORS.map(({ name, value: color }) => swatch(name, color))}
      {recentColors.length > 0 && <span className="color-divider" aria-hidden="true" />}
      {recentColors.map((color) => swatch(`recent color ${color}`, color))}
      <label className="custom-color">
        <Pipette size={14} aria-hidden="true" />
        <span className="sr-only">Custom {lowerLabel} color</span>
        <input type="color" aria-label={`Custom ${lowerLabel} color`} value={customValue} onInput={(event) => onPreview(event.currentTarget.value)} onBlur={(event) => onCommit(event.currentTarget.value)} onKeyDown={handleKeyDown} />
      </label>
    </div>
  </fieldset>;
}
