"use client";

import type { MeasurementSystem } from "@/lib/measurements";
import { ChevronDownIcon, ConvertIcon } from "@/components/icons";

// Three options only. "UK/Ireland" is intentionally NOT offered as a target:
// its output today is identical to Metric (g/kg, ml/L, °C), and an "Imperial"
// umbrella would be ambiguous and unsafe (US vs UK pints/cups/fl-oz differ).
// UK/IE is retained internally as a SOURCE region so imperial pints are read
// correctly. A later "My units" (saved preference → Metric or US) can replace
// this list. Spec: docs/spec/measurement-conversion.md §20.
export const MEASUREMENT_OPTIONS: { value: MeasurementSystem; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "metric", label: "Metric" },
  { value: "us", label: "US custom" },
];

// The widest label — reserves a FIXED width so the pill never resizes as the
// selection changes.
const WIDEST_LABEL = MEASUREMENT_OPTIONS.reduce((a, b) => (b.label.length > a.length ? b.label : a), "Convert");

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
      {/* Fixed-width label box: the invisible widest label reserves the width; the
          current label renders in the same grid cell so nothing shifts. */}
      <span className="grid">
        <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-nowrap">
          {WIDEST_LABEL}
        </span>
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
