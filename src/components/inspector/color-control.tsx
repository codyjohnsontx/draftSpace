"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Ban, Palette, Pipette } from "lucide-react";
import { CURATED_COLORS, overflowColors, quickColors, type PaletteSwatch, type SharedValue } from "@/features/inspector/style-values";

type ColorValue = SharedValue<string | null>;
/** The second argument is what the disclosure wants done once a chip in it has been picked. */
type SwatchRenderer = (swatch: PaletteSwatch, onPicked?: () => void) => ReactNode;

/**
 * The rest of the palette, one press away. It is its own component so that a control which
 * stops being compact unmounts it: coming back to the floating bar then finds the disclosure
 * closed rather than reopening whatever was showing before the inspector was docked.
 */
function ColorOverflow({ label, swatches, eyedropper, renderSwatch }: {
  label: "Fill" | "Stroke";
  swatches: readonly PaletteSwatch[];
  eyedropper: ReactNode;
  renderSwatch: SwatchRenderer;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const lowerLabel = label.toLowerCase();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return <div
    className="color-popover-wrap"
    ref={wrapRef}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      // The canvas takes Escape as "drop the selection", which would close the inspector out from
      // under the menu rather than closing the menu.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }}
  >
    <button
      ref={triggerRef}
      type="button"
      className="color-more"
      aria-label={`More ${lowerLabel} colors`}
      aria-expanded={open}
      aria-controls={popoverId}
      onClick={() => setOpen((wasOpen) => !wasOpen)}
    ><Palette size={15} aria-hidden="true" /></button>
    {open && <div className="color-popover" id={popoverId} role="group" aria-label={`More ${lowerLabel} colors`}>
      <span className="color-popover-heading">{label}</span>
      {/* Closing on pick keeps the chip that just moved up into the row on show from reflowing
          the grid the pointer is still resting on. */}
      <div className="color-row">{swatches.map((swatch) => renderSwatch(swatch, () => setOpen(false)))}{eyedropper}</div>
    </div>}
  </div>;
}

/**
 * The palette, and how much of it is on show. Docked in the sidebar there is room for all ten
 * colours at once. On the floating bar there is not - twenty flat chips across two of these
 * controls pushed the bar past the width of a laptop screen and silently clipped the controls to
 * their right - so a compact control shows six and keeps the rest, the recent colours and the
 * eyedropper one press away. Neither shape offers fewer colours than the other.
 */
export function ColorControl({ label, value, allowNone, recentColors, compact, onSelect, onPreview, onCommit, onCancel }: {
  label: "Fill" | "Stroke";
  value: ColorValue;
  allowNone?: boolean;
  recentColors: readonly string[];
  compact?: boolean;
  onSelect: (color: string | null) => void;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel: () => void;
}) {
  const selected = value.kind === "value" ? value.value : undefined;
  const representative = value.kind === "mixed" ? value.representative : selected;
  const customValue = typeof representative === "string" && /^#[0-9a-f]{6}$/i.test(representative) ? representative : "#b85f3f";
  const lowerLabel = label.toLowerCase();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); event.currentTarget.blur(); }
    if (event.key === "Enter") { onCommit(event.currentTarget.value); event.currentTarget.blur(); }
  };
  const swatch: SwatchRenderer = ({ name, value: color }, onPicked) => <button
    key={`${label}-${color}`}
    type="button"
    className="color-swatch"
    style={{ "--swatch-color": color } as CSSProperties}
    aria-label={`Set ${lowerLabel} to ${name}`}
    aria-pressed={selected?.toLowerCase() === color.toLowerCase()}
    onClick={() => { onSelect(color); onPicked?.(); }}
  ><span /></button>;

  const noneSwatch = allowNone ? <button type="button" className="color-swatch none-swatch" aria-label="Remove fill" aria-pressed={selected === null} onClick={() => onSelect(null)}><Ban size={14} /></button> : null;
  const eyedropper = <label className="custom-color">
    <Pipette size={15} aria-hidden="true" />
    <span className="sr-only">Custom {lowerLabel} color</span>
    <input type="color" aria-label={`Custom ${lowerLabel} color`} value={customValue} onInput={(event) => onPreview(event.currentTarget.value)} onBlur={(event) => onCommit(event.currentTarget.value)} onKeyDown={handleKeyDown} />
  </label>;

  if (!compact) return <fieldset className="inspector-group color-group">
    <legend>{label}{value.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend>
    <div className="color-row" aria-label={`${label} colors`}>
      {noneSwatch}
      {CURATED_COLORS.map(({ name, value: color }) => swatch({ name, value: color }))}
      {recentColors.length > 0 && <span className="color-divider" aria-hidden="true" />}
      {recentColors.map((color) => swatch({ name: `recent color ${color}`, value: color }))}
      {eyedropper}
    </div>
  </fieldset>;

  const quick = quickColors(representative);

  return <fieldset className="inspector-group color-group">
    <legend>{label}{value.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend>
    <div className="color-row" aria-label={`${label} colors`}>
      {noneSwatch}
      {quick.map((entry) => swatch(entry))}
      <ColorOverflow label={label} swatches={overflowColors(quick, recentColors)} eyedropper={eyedropper} renderSwatch={swatch} />
    </div>
  </fieldset>;
}
