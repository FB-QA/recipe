"use client";

import type { MeasurementSystem } from "@/lib/measurements";
import { ChevronDownIcon } from "@/components/icons";

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

/**
 * The recipe measurement selector — a compact native <select> styled to match
 * the portion stepper. Native on purpose: full keyboard + screen-reader support
 * for free. The visible label doubles as a width sizer so the pill HUGS the
 * current value (a native select otherwise stretches to its widest option,
 * leaving "Metric" left-aligned with dead space).
 */
export function MeasurementToggle({
  value,
  onChange,
}: {
  value: MeasurementSystem;
  onChange: (value: MeasurementSystem) => void;
}) {
  const label = MEASUREMENT_OPTIONS.find((o) => o.value === value)?.label ?? "Original";
  return (
    <label className="relative inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface text-[13px] font-semibold text-ink">
      <span className="sr-only">Measurement units</span>
      {/* Visible value that also sizes the pill to the current selection. */}
      <span aria-hidden className="whitespace-nowrap py-1 pl-3.5 pr-8">
        {label}
      </span>
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
      <ChevronDownIcon size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
    </label>
  );
}
