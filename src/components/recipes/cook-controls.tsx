"use client";

import type { Dispatch, SetStateAction } from "react";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { MeasurementToggle } from "./measurement-toggle";
import type { MeasurementSystem } from "@/lib/measurements";

const MIN_PORTIONS = 1;
const MAX_PORTIONS = 50;

function formatServings(n: number): string {
  return `${n} portion${n === 1 ? "" : "s"}`;
}

/**
 * The shared cook controls — portion stepper + measurement selector. Rendered
 * both in the ingredient-list header and inside the per-step ingredient drawer,
 * from ONE place, so they always agree. The state lives in CookSections; these
 * are pure controls over it.
 */
export function CookControls({
  base,
  target,
  setTarget,
  system,
  setSystem,
  className = "",
}: {
  /** Base servings; null when the recipe has no numeric serving to scale from. */
  base: number | null;
  target: number;
  setTarget: Dispatch<SetStateAction<number>>;
  system: MeasurementSystem;
  setSystem: (value: MeasurementSystem) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {base !== null && (
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-1.5 py-1">
          <button
            type="button"
            aria-label="Fewer portions"
            onClick={() => setTarget((t) => Math.max(MIN_PORTIONS, t - 1))}
            disabled={target <= MIN_PORTIONS}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-2 disabled:opacity-40"
          >
            <MinusIcon size={16} />
          </button>
          <span className="min-w-[68px] text-center text-[13px] font-semibold text-ink">{formatServings(target)}</span>
          <button
            type="button"
            aria-label="More portions"
            onClick={() => setTarget((t) => Math.min(MAX_PORTIONS, t + 1))}
            disabled={target >= MAX_PORTIONS}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-2 disabled:opacity-40"
          >
            <PlusIcon size={16} />
          </button>
        </div>
      )}
      <MeasurementToggle value={system} onChange={setSystem} />
    </div>
  );
}
