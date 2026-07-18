"use client";

import type { Dispatch, SetStateAction } from "react";
import { FoodImage } from "@/components/food-icons";
import { AddToListSheet } from "@/components/grocery/add-to-list-sheet";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { scaleIngredientText } from "@/lib/recipes/scale";
import type { IngredientLike } from "@/lib/recipes/ingredient";

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
}) {
  const sections: IngredientGroupView[] =
    groups && groups.length > 0 ? groups : [{ id: "all", name: null, ingredients }];
  const showHeadings = sections.length > 1 || Boolean(sections[0]?.name);

  return (
    <section>
      <div className="mt-5 mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">Ingredients</h2>
        {base !== null && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-1.5 py-1">
            <button
              type="button"
              aria-label="Fewer portions"
              onClick={() => setTarget((t) => Math.max(1, t - 1))}
              disabled={target <= 1}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-2 disabled:opacity-40"
            >
              <MinusIcon size={16} />
            </button>
            <span className="min-w-[68px] text-center text-[13px] font-semibold text-ink">
              {formatServings(target)}
            </span>
            <button
              type="button"
              aria-label="More portions"
              onClick={() => setTarget((t) => Math.min(50, t + 1))}
              disabled={target >= 50}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-2 disabled:opacity-40"
            >
              <PlusIcon size={16} />
            </button>
          </div>
        )}
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
              {section.ingredients.map((ing) => (
                <li
                  key={ing.id}
                  className="flex items-center gap-3 border-b border-line-2 px-4 py-3 text-[14px] last:border-b-0"
                >
                  <FoodImage text={ing.name ?? ing.display_text} size={22} className="flex-none text-ink-3" />
                  <span className="text-ink-2">{scaleIngredientText(ing.display_text, scale)}</span>
                  {ing.optional && (
                    <span className="ml-auto flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-3">
                      optional
                    </span>
                  )}
                </li>
              ))}
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

function formatServings(n: number): string {
  return `${n} portion${n === 1 ? "" : "s"}`;
}
