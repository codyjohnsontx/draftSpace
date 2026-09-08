"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Ban, Palette, Pipette } from "lucide-react";
import { CURATED_COLORS, overflowColors, quickColors, swatchName, type PaletteSwatch, type SharedValue } from "@/features/inspector/style-values";

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
  const popoverRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const [above, setAbove] = useState(false);
  const [below, setBelow] = useState(false);
  const popoverId = useId();
  const lowerLabel = label.toLowerCase();
  // Escape and a picked chip both take the pressed control away with them, so each hands the focus
  // back to the trigger, which outlives the disclosure. A press outside hands back nothing: the
  // focus belongs wherever that press put it.
  const closeToTrigger = () => { setOpen(false); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  // How much room the grid genuinely has. The disclosure grows upward from a trigger the wrapped
  // bar can put anywhere, so no constant can say; and the ceiling is the bottom of the top bar
  // rather than the top of the window, because a row grown past it is hit-testable but painted
  // over. Measured off the trigger and off offsetHeight so the panel's opening transform cannot
  // skew it.
  useLayoutEffect(() => {
    const popover = popoverRef.current, grid = gridRef.current, trigger = triggerRef.current;
    if (!open || !popover || !grid || !trigger) return;
    const fit = () => {
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2")) || 0;
      const ceiling = (document.querySelector(".top-bar")?.getBoundingClientRect().bottom ?? 0) + gap;
      const chrome = popover.offsetHeight - grid.offsetHeight;
      setRoom(Math.max(0, Math.round(trigger.getBoundingClientRect().top - gap - ceiling - chrome)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, swatches.length]);

  // Whether that room was enough, re-read after the clamp lands and on every scroll: an edge that
  // still says "there is more" once the user has reached the end is the same lie the other way up.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!open || !grid) return;
    const track = () => {
      setAbove(grid.scrollTop > 1);
      setBelow(grid.scrollTop + grid.clientHeight < grid.scrollHeight - 1);
    };
    track();
    grid.addEventListener("scroll", track);
    return () => grid.removeEventListener("scroll", track);
  }, [open, room, swatches.length]);

  return <div
    className="color-popover-wrap"
    ref={wrapRef}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      // The canvas takes Escape as "drop the selection", which would close the inspector out from
      // under the menu rather than closing the menu.
      event.stopPropagation();
      closeToTrigger();
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
    {open && <div
      className="color-popover"
      id={popoverId}
      role="group"
      aria-label={`More ${lowerLabel} colors`}
      ref={popoverRef}
      style={room === null ? undefined : { "--disclosure-fit": `${room}px` } as CSSProperties}
    >
      <span className="color-popover-heading">{label}</span>
      {/* Closing on pick keeps the chip that just moved up into the row on show from reflowing
          the grid the pointer is still resting on. */}
      <div className="color-row" ref={gridRef}>{swatches.map((swatch) => renderSwatch(swatch, closeToTrigger))}{eyedropper}</div>
      {(above || below) && <span className="color-popover-marks" aria-hidden="true">
        {above && <span className="color-popover-more" data-edge="above" />}
        {below && <span className="color-popover-more" data-edge="below" />}
      </span>}
    </div>}
  </div>;
}

/**
 * The eyedropper, and the colour it is part-way through trying out. A compact control keeps it
 * behind the palette disclosure, so closing that disclosure removes the input outright, and an
 * input removed while it holds focus is not owed a blur - it commits the colour it was previewing
 * itself rather than leaving the canvas painting one the board never receives.
 */
function Eyedropper({ label, value, onPreview, onCommit, onCancel }: {
  label: string;
  value: string;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel: () => void;
}) {
  const previewed = useRef<string | null>(null);
  const commit = useRef(onCommit);
  useEffect(() => { commit.current = onCommit; });
  useEffect(() => () => { if (previewed.current !== null) commit.current(previewed.current); }, []);
  const settle = (color: string) => { previewed.current = null; onCommit(color); };

  return <label className="custom-color">
    <Pipette size={15} aria-hidden="true" />
    <span className="sr-only">Custom {label} color</span>
    <input
      type="color"
      aria-label={`Custom ${label} color`}
      value={value}
      onInput={(event) => { previewed.current = event.currentTarget.value; onPreview(event.currentTarget.value); }}
      onBlur={(event) => settle(event.currentTarget.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") { event.preventDefault(); previewed.current = null; onCancel(); event.currentTarget.blur(); }
        if (event.key === "Enter") { settle(event.currentTarget.value); event.currentTarget.blur(); }
      }}
    />
  </label>;
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
  const eyedropper = <Eyedropper label={lowerLabel} value={customValue} onPreview={onPreview} onCommit={onCommit} onCancel={onCancel} />;

  if (!compact) return <fieldset className="inspector-group color-group">
    <legend>{label}{value.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend>
    <div className="color-row" aria-label={`${label} colors`}>
      {noneSwatch}
      {CURATED_COLORS.map(({ name, value: color }) => swatch({ name, value: color }))}
      {recentColors.length > 0 && <span className="color-divider" aria-hidden="true" />}
      {recentColors.map((color) => swatch({ name: swatchName(color, "recent"), value: color }))}
      {eyedropper}
    </div>
  </fieldset>;

  const quick = quickColors(representative, recentColors);

  return <fieldset className="inspector-group color-group">
    <legend>{label}{value.kind === "mixed" && <span className="mixed-value">Mixed</span>}</legend>
    <div className="color-row" aria-label={`${label} colors`}>
      {noneSwatch}
      {quick.map((entry) => swatch(entry))}
      <ColorOverflow label={label} swatches={overflowColors(quick, recentColors)} eyedropper={eyedropper} renderSwatch={swatch} />
    </div>
  </fieldset>;
}
