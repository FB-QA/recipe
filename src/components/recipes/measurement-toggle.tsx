"use client";

import type { MeasurementSystem } from "@/lib/measurements";
import { ChevronDownIcon, ConvertIcon } from "@/components/icons";

// Three options only. The non-metric target is labelled "Imperial" (the familiar
// everyday word for non-metric), though the values it produces are US customary
// (US cup 236 ml, US pint 473 ml, oz/lb/°F) — a true imperial pint is 568 ml.
// "UK/Ireland" is NOT a separate target (its output equals Metric today); it is
// retained internally as a SOURCE region so imperial pints are read correctly.
// Spec: docs/spec/measurement-conversion.md §20.
export const MEASUREMENT_OPTIONS: { value: MeasurementSystem; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "metric", label: "Metric" },
  { value: "us", label: "Imperial" },
];

// Every possible CLOSED-state label. "Original" shows as the "Convert"
// placeholder. All are stacked invisibly in the label cell so it reserves the
// pixel-widest — the pill never resizes as the selection changes.
const DISPLAY_LABELS = MEASUREMENT_OPTIONS.map((o) => (o.value === "original" ? "Convert" : o.label));

/**
 * The recipe measurement selector — a compact, FIXED-WIDTH native <select>.
 * Native on purpose: full keyboard + screen-reader support for free. Shows a
 * "Convert" placeholder (icon + word) until a system is chosen, then the chosen
 * system — and never changes size (an invisible widest-label sizer reserves the
 * width, so nothing shifts on selection). Mobile-first: one-hand tap target.
 */
export function MeasurementToggle({
  value,
  onChange,
}: {
  value: MeasurementSystem;
  onChange: (value: MeasurementSystem) => void;
}) {
  // "Original" is the default/no-conversion state → show the "Convert" placeholder.
  const display = value === "original" ? "Convert" : (MEASUREMENT_OPTIONS.find((o) => o.value === value)?.label ?? "Convert");
  return (
    <label className="relative inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line bg-surface pl-3 pr-2.5 text-[13px] font-semibold text-ink">
      <span className="sr-only">Measurement units</span>
      <ConvertIcon size={15} className="flex-none text-ink-3" />
      {/* Fixed-width label box: every possible label sits invisibly in the same
          grid cell, so the cell always reserves the pixel-widest; the current
          label renders on top of them. Nothing shifts on selection. */}
      <span className="grid">
        {DISPLAY_LABELS.map((l) => (
          <span key={l} aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
            {l}
          </span>
        ))}
        <span aria-hidden className="col-start-1 row-start-1 whitespace-nowrap">
          {display}
        </span>
      </span>
      <ChevronDownIcon size={14} className="flex-none text-ink-3" />
      {/* Transparent native select overlaid for interaction + a11y. */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MeasurementSystem)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full bg-transparent text-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-basil"
      >
        {MEASUREMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
