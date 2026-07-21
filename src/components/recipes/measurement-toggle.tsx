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
  { value: "us", label: "US customary" },
];

/**
 * The recipe measurement selector — a compact native <select> styled to match
 * the portion stepper. Native on purpose: full keyboard + screen-reader support
 * for free, and it never crowds a four-option segmented control on mobile.
 */
export function MeasurementToggle({
  value,
  onChange,
}: {
  value: MeasurementSystem;
  onChange: (value: MeasurementSystem) => void;
}) {
  return (
    <label className="relative flex items-center rounded-full border border-line bg-surface">
      <span className="sr-only">Measurement units</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MeasurementSystem)}
        className="h-9 min-h-[44px] appearance-none rounded-full bg-transparent py-1 pl-3.5 pr-8 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-basil"
      >
        {MEASUREMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={15} className="pointer-events-none absolute right-3 text-ink-3" />
    </label>
  );
}
