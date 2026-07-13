"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CartIcon, CheckIcon } from "@/components/icons";
import { FoodImage } from "@/components/food-icons";
import { addRecipeIngredientsToList } from "@/lib/grocery/actions";
import { scaleIngredientText } from "@/lib/recipes/scale";
import { clsx } from "@/lib/clsx";
import type { IngredientLike } from "@/lib/recipes/ingredient";
import type { GroceryList } from "@/lib/grocery/queries";

export function AddToListSheet({
  recipeId,
  ingredients,
  lists,
  scale = 1,
}: {
  recipeId: string;
  ingredients: IngredientLike[];
  lists: GroceryList[];
  scale?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ingredients.map((i) => i.id)));
  const [listId, setListId] = useState<string>(lists[0]?.id ?? "");
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const router = useRouter();

  const allSelected = selected.size === ingredients.length;
  const targetName = lists.find((l) => l.id === listId)?.name ?? lists[0]?.name ?? "This Week";

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () =>
    startTransition(async () => {
      const result = await addRecipeIngredientsToList(
        recipeId,
        [...selected],
        listId || undefined,
        scale,
      );
      if (result.count > 0) {
        setAddedCount(result.count);
        setOpen(false);
      }
    });

  if (addedCount !== null) {
    return (
      <Button variant="ghost" fullWidth onClick={() => router.push("/list")}>
        <CheckIcon size={18} /> Added {addedCount} item{addedCount === 1 ? "" : "s"} — view list
      </Button>
    );
  }

  return (
    <>
      <Button fullWidth onClick={() => setOpen(true)}>
        <CartIcon size={18} /> Add to grocery list
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add to grocery list">
        {lists.length > 1 && (
          <div className="mb-4">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
              List
            </div>
            <div className="flex flex-wrap gap-2">
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setListId(l.id)}
                  className={clsx(
                    "rounded-full border px-3.5 py-2 text-[13px] font-semibold",
                    l.id === listId
                      ? "border-basil bg-basil text-white"
                      : "border-line bg-surface text-ink-2",
                  )}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            {selected.size} of {ingredients.length} selected
          </span>
          <button
            onClick={() => setSelected(allSelected ? new Set() : new Set(ingredients.map((i) => i.id)))}
            className="text-[13px] font-semibold text-basil"
          >
            {allSelected ? "Select none" : "Select all"}
          </button>
        </div>

        <ul className="max-h-[42dvh] overflow-y-auto overflow-hidden rounded-card border border-line">
          {ingredients.map((ing) => {
            const on = selected.has(ing.id);
            return (
              <li key={ing.id}>
                <button
                  onClick={() => toggle(ing.id)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 border-b border-line-2 px-4 py-3 text-left last:border-b-0"
                >
                  <span
                    className={clsx(
                      "grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] border-2 text-white",
                      on ? "border-basil bg-basil" : "border-line",
                    )}
                  >
                    {on && <CheckIcon size={12} />}
                  </span>
                  <FoodImage
                    text={ing.name ?? ing.display_text}
                    size={22}
                    className="flex-none text-ink-3"
                  />
                  <span className="flex-1 text-[14px] text-ink">
                    {scaleIngredientText(ing.display_text, scale)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4">
          <Button fullWidth loading={pending} disabled={selected.size === 0} onClick={confirm}>
            Add {selected.size} item{selected.size === 1 ? "" : "s"} to {targetName}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
