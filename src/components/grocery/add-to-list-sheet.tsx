"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CartIcon, CheckIcon } from "@/components/icons";
import { FoodImage } from "@/components/food-icons";
import { addRecipeIngredientsToList } from "@/lib/grocery/actions";
import { scaleIngredientText } from "@/lib/recipes/scale";
import { useToast } from "@/components/ui/toast";
import { clsx } from "@/lib/clsx";
import type { IngredientLike } from "@/lib/recipes/ingredient";

export function AddToListSheet({
  recipeId,
  ingredients,
  scale = 1,
  addedIngredientIds,
}: {
  recipeId: string;
  ingredients: IngredientLike[];
  scale?: number;
  addedIngredientIds: string[];
}) {
  const onList = useMemo(() => new Set(addedIngredientIds), [addedIngredientIds]);
  const selectable = useMemo(() => ingredients.filter((i) => !onList.has(i.id)), [ingredients, onList]);
  const allOnList = selectable.length === 0;

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectable.map((i) => i.id)));
  const [done, setDone] = useState<{ count: number; listId: string } | null>(null);
  const router = useRouter();
  const toast = useToast();

  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () =>
    startTransition(async () => {
      const result = await addRecipeIngredientsToList(recipeId, [...selected], scale);
      if (result.count > 0) {
        const items = `${result.count} item${result.count === 1 ? "" : "s"}`;
        toast(
          result.created
            ? `Started “${result.listName}” · ${items}`
            : `Added ${items} to “${result.listName}”`,
        );
        setDone({ count: result.count, listId: result.listId });
        setOpen(false);
      } else if (result.skipped > 0) {
        toast(`Already on “${result.listName}”`);
        setOpen(false);
      }
    });

  return (
    <>
      {done ? (
        <Button variant="ghost" fullWidth onClick={() => router.push(`/list?list=${done.listId}`)}>
          <CheckIcon size={18} /> Added {done.count} item{done.count === 1 ? "" : "s"} — view list
        </Button>
      ) : (
        <Button fullWidth onClick={() => setOpen(true)}>
          <CartIcon size={18} /> Add to grocery list
        </Button>
      )}

      {/* Sheet stays mounted (not an early return) so it can animate closed. */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Add to grocery list">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
            {allOnList ? "All on your list" : `${selected.size} of ${selectable.length} selected`}
          </span>
          {!allOnList && (
            <button
              onClick={() => setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)))}
              className="text-[13px] font-semibold text-basil"
            >
              {allSelected ? "Select none" : "Select all"}
            </button>
          )}
        </div>

        <ul className="max-h-[42dvh] overflow-y-auto overflow-hidden rounded-card border border-line">
          {ingredients.map((ing) => {
            const already = onList.has(ing.id);
            const on = selected.has(ing.id);
            return (
              <li key={ing.id}>
                <button
                  onClick={() => !already && toggle(ing.id)}
                  disabled={already}
                  aria-pressed={already || on}
                  className="flex w-full items-center gap-3 border-b border-line-2 px-4 py-3 text-left last:border-b-0 disabled:cursor-default"
                >
                  <span
                    className={clsx(
                      "grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] border-2 text-white",
                      already ? "border-basil-2 bg-basil-2" : on ? "border-basil bg-basil" : "border-line",
                    )}
                  >
                    {(already || on) && <CheckIcon size={12} />}
                  </span>
                  <FoodImage
                    text={ing.name ?? ing.display_text}
                    size={22}
                    className={clsx("flex-none text-ink-3", already && "opacity-50")}
                  />
                  <span className={clsx("flex-1 text-ingredient", already ? "text-ink-3" : "text-ink")}>
                    {scaleIngredientText(ing.display_text, scale)}
                  </span>
                  {already && (
                    <span className="flex-none text-[11px] font-semibold uppercase tracking-[0.04em] text-basil">
                      On list
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4">
          {allOnList ? (
            <p className="rounded-sm bg-basil-tint px-4 py-3 text-center text-[13.5px] font-medium text-basil">
              Every ingredient is already on your list.
            </p>
          ) : (
            <Button fullWidth loading={pending} disabled={selected.size === 0} onClick={confirm}>
              Add {selected.size} item{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
