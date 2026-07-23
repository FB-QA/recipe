"use client";

import type { Dispatch, SetStateAction } from "react";
import { FoodImage } from "@/components/food-icons";
import { AddToListSheet } from "@/components/grocery/add-to-list-sheet";
import { CookControls } from "./cook-controls";
import { renderIngredientAmount } from "@/lib/recipes/ingredient-amount";
import { ApproximateBadge } from "./approximate-badge";
import type { IngredientLike } from "@/lib/recipes/ingredient";
import type { MeasurementRegion, MeasurementSystem } from "@/lib/measurements";

export interface IngredientGroupView {
  id: string;
  name: string | null;
  ingredients: (IngredientLike & { optional?: boolean })[];
}

export function IngredientsSection({
  recipeId,
  ingredients,
  groups,
  addedIngredientIds,
  base,
  target,
  setTarget,
  scale,
  system,
  setSystem,
  sourceRegion,
}: {
  recipeId: string;
  ingredients: IngredientLike[];
  /** Display sections. A single unnamed group renders with no heading (§18). */
  groups?: IngredientGroupView[];
  addedIngredientIds: string[];
  /** Serving scale is lifted to a shared parent so the method drawer scales too. */
  base: number | null;
  target: number;
  setTarget: Dispatch<SetStateAction<number>>;
  scale: number;
  system: MeasurementSystem;
  setSystem: (value: MeasurementSystem) => void;
  sourceRegion?: MeasurementRegion;
}) {
  const sections: IngredientGroupView[] =
    groups && groups.length > 0 ? groups : [{ id: "all", name: null, ingredients }];
  const showHeadings = sections.length > 1 || Boolean(sections[0]?.name);

  return (
    <section>
      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">Ingredients</h2>
        <CookControls base={base} target={target} setTarget={setTarget} system={system} setSystem={setSystem} />
      </div>

      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.id}>
            {showHeadings && section.name && (
              <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.03em] text-basil">
                {section.name}
              </h3>
            )}
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {section.ingredients.map((ing) => {
                const rendered = renderIngredientAmount(ing, { scale, targetSystem: system, sourceRegion });
                return (
                <li
                  key={ing.id}
                  className="flex items-center gap-3 border-b border-line-2 px-4 py-3 text-ingredient last:border-b-0"
                >
                  <FoodImage text={ing.name ?? ing.display_text} size={22} className="flex-none text-ink-3" />
                  <span className="text-ink-2">
                    {rendered.text}
                    {rendered.approximate && <ApproximateBadge note={rendered.note} />}
                  </span>
                  {ing.optional && (
                    <span className="ml-auto flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-3">
                      optional
                    </span>
                  )}
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <AddToListSheet
          recipeId={recipeId}
          ingredients={ingredients}
          scale={scale}
          addedIngredientIds={addedIngredientIds}
        />
      </div>
    </section>
  );
}
