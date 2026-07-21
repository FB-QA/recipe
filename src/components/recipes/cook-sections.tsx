"use client";

import { useState } from "react";
import { parseServings } from "@/lib/recipes/scale";
import { IngredientsSection, type IngredientGroupView } from "./ingredients-section";
import { MethodSteps, type MethodStep } from "./method-steps";
import { MEASUREMENT_OPTIONS, MeasurementToggle } from "./measurement-toggle";
import type { IngredientLike } from "@/lib/recipes/ingredient";
import type { MeasurementRegion, MeasurementSystem } from "@/lib/measurements";

/**
 * Ingredients + Method, sharing one serving scale AND one measurement system.
 * Both controls live in the ingredient header, but the values they produce also
 * drive the per-step drawer and the in-step temperature conversion — otherwise a
 * recipe scaled to 4 (or switched to metric) could disagree between the list and
 * a tapped step. The state is owned here, above both, and the two controls are
 * independent (spec §21): scaling and conversion always come off the original.
 */
export function CookSections({
  recipeId,
  ingredients,
  groups,
  servingsText,
  addedIngredientIds,
  sourceRegion,
  steps,
}: {
  recipeId: string;
  ingredients: IngredientLike[];
  groups?: IngredientGroupView[];
  servingsText: string | null;
  addedIngredientIds: string[];
  /** Detected source region; undefined when unknown (region-sensitive units stay original). */
  sourceRegion?: MeasurementRegion;
  steps: MethodStep[];
}) {
  const base = parseServings(servingsText);
  const [target, setTarget] = useState(base ?? 1);
  const scale = base ? target / base : 1;
  const [system, setSystem] = useState<MeasurementSystem>("original");
  const systemLabel = MEASUREMENT_OPTIONS.find((o) => o.value === system)?.label ?? "Original";

  return (
    <>
      {/* Accessible announcement of a measurement change (spec §38). */}
      <p role="status" aria-live="polite" className="sr-only">
        {`Measurements shown as ${systemLabel}.`}
      </p>

      {ingredients.length > 0 && (
        <IngredientsSection
          recipeId={recipeId}
          ingredients={ingredients}
          groups={groups}
          addedIngredientIds={addedIngredientIds}
          base={base}
          target={target}
          setTarget={setTarget}
          scale={scale}
          system={system}
          setSystem={setSystem}
          sourceRegion={sourceRegion}
        />
      )}

      {steps.length > 0 && (
        <section>
          <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">Method</h2>
            {/* Method-only recipes (no ingredient list) still need the selector so
                their explicit oven temperatures can convert. */}
            {ingredients.length === 0 && <MeasurementToggle value={system} onChange={setSystem} />}
          </div>
          <MethodSteps
            steps={steps}
            scale={scale}
            base={base}
            target={target}
            setTarget={setTarget}
            system={system}
            setSystem={setSystem}
            sourceRegion={sourceRegion}
          />
        </section>
      )}
    </>
  );
}
