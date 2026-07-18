"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { FoodImage } from "@/components/food-icons";
import { ListIcon } from "@/components/icons";
import { highlightStep } from "@/lib/recipes/highlight";
import { scaleIngredientText } from "@/lib/recipes/scale";

export type StepIngredient = {
  id: string;
  display_text: string;
  quantity: string | null;
  unit: string | null;
  name: string | null;
};

export type MethodStep = {
  id: string;
  title: string | null;
  instruction: string;
  ingredients: StepIngredient[];
};

/**
 * The method list. Each step that references ingredients is tappable and opens a
 * drawer with just that step's ingredients and their measurements — a quick "what
 * do I need for this bit" without scrolling back up. Larger type than the old
 * inline list so it reads at a glance while cooking.
 */
export function MethodSteps({
  steps,
  stepTerms,
  scale = 1,
}: {
  steps: MethodStep[];
  stepTerms: string[];
  /** Serving scale, shared with the ingredient list so drawer amounts agree. */
  scale?: number;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const active = openIdx !== null ? steps[openIdx] : null;

  return (
    <>
      <ol className="flex flex-col gap-3.5">
        {steps.map((step, i) => {
          const tappable = step.ingredients.length > 0;
          const body = (
            <>
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-basil-tint text-[14px] font-bold text-basil">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                {step.title && <p className="mb-0.5 text-[16px] font-bold text-ink">{step.title}</p>}
                <p className="text-[16px] leading-relaxed text-ink-2">
                  {highlightStep(step.instruction, stepTerms).map((seg, j) =>
                    seg.bold ? (
                      <strong key={j} className="font-semibold text-ink">
                        {seg.text}
                      </strong>
                    ) : (
                      <span key={j}>{seg.text}</span>
                    ),
                  )}
                </p>
                {tappable && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-basil">
                    <ListIcon size={13} />
                    {step.ingredients.length} ingredient{step.ingredients.length === 1 ? "" : "s"} · tap to view
                  </span>
                )}
              </div>
            </>
          );
          return (
            <li key={step.id}>
              {tappable ? (
                <button
                  type="button"
                  onClick={() => setOpenIdx(i)}
                  aria-label={`Ingredients for step ${i + 1}`}
                  className="flex w-full gap-3.5 rounded-[14px] text-left transition-colors -mx-2 px-2 py-1 hover:bg-surface-2 active:bg-surface-2"
                >
                  {body}
                </button>
              ) : (
                <div className="flex gap-3.5 px-2 py-1">{body}</div>
              )}
            </li>
          );
        })}
      </ol>

      <Sheet
        open={active !== null}
        onClose={() => setOpenIdx(null)}
        title={active ? `Step ${(openIdx ?? 0) + 1} ingredients` : undefined}
      >
        {active && (
          <ul className="flex flex-col gap-1 pb-2">
            {active.ingredients.map((ing) => (
              <li
                key={ing.id}
                className="flex items-center gap-3 border-b border-line-2 py-2.5 text-[15px] text-ink last:border-b-0"
              >
                <FoodImage text={ing.name ?? ing.display_text} size={24} className="flex-none text-ink-3" />
                <span>{scaleIngredientText(ing.display_text, scale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
