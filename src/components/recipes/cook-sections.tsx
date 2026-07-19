"use client";

import { useState } from "react";
import { parseServings } from "@/lib/recipes/scale";
import { IngredientsSection, type IngredientGroupView } from "./ingredients-section";
import { MethodSteps, type MethodStep } from "./method-steps";
import type { IngredientLike } from "@/lib/recipes/ingredient";

/**
 * Ingredients + Method, sharing one serving scale. The portion control lives in
 * the ingredient list, but the scale it produces also drives the per-step
 * ingredient drawer — otherwise a recipe scaled to 4 could show "2 cups" in the
 * list and "1 cup" in a tapped step. The state is owned here, above both.
 */
export function CookSections({
  recipeId,
  ingredients,
  groups,
  servingsText,
  addedIngredientIds,
  steps,
}: {
  recipeId: string;
  ingredients: IngredientLike[];
  groups?: IngredientGroupView[];
  servingsText: string | null;
  addedIngredientIds: string[];
  steps: MethodStep[];
}) {
  const base = parseServings(servingsText);
  const [target, setTarget] = useState(base ?? 1);
  const scale = base ? target / base : 1;

  return (
    <>
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
        />
      )}

      {steps.length > 0 && (
        <section>
          <h2 className="mb-3 mt-5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">Method</h2>
          <MethodSteps steps={steps} scale={scale} />
        </section>
      )}
    </>
  );
}
