"use client";

import { useState } from "react";
import { FoodImage } from "@/components/food-icons";
import { AddToListSheet } from "@/components/grocery/add-to-list-sheet";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { parseServings, scaleIngredientText } from "@/lib/recipes/scale";

type Ingredient = {
  id: string;
  display_text: string;
  quantity: string | null;
  unit: string | null;
  name: string | null;
};
type List = { id: string; name: string };

export function IngredientsSection({
  recipeId,
  ingredients,
  servingsText,
  lists,
}: {
  recipeId: string;
  ingredients: Ingredient[];
  servingsText: string | null;
  lists: List[];
}) {
  const base = parseServings(servingsText);
  const [target, setTarget] = useState(base ?? 1);
  const scale = base ? target / base : 1;

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

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {ingredients.map((ing) => (
          <li
            key={ing.id}
            className="flex items-center gap-3 border-b border-line-2 px-4 py-3 text-[14px] last:border-b-0"
          >
            <FoodImage text={ing.name ?? ing.display_text} size={22} className="flex-none text-ink-3" />
            <span className="text-ink-2">{scaleIngredientText(ing.display_text, scale)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <AddToListSheet recipeId={recipeId} ingredients={ingredients} lists={lists} scale={scale} />
      </div>
    </section>
  );
}

function formatServings(n: number): string {
  return `${n} portion${n === 1 ? "" : "s"}`;
}
