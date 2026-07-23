"use client";

import { CloseIcon, PlusIcon } from "@/components/icons";

/**
 * The group-aware ingredient editor used when a recipe carries sections
 * (imports and v2 recipes). Sections show their heading; ranges, optional
 * markers and alternatives are surfaced as read-only badges reflecting what the
 * source gave — editing the line text never re-invents them. A section whose
 * last ingredient is removed drops out on save (resolveGroups), so "delete the
 * last ingredient of a group → group removed cleanly" falls out for free.
 */

export interface EditIngredient {
  display_text: string;
  optional: boolean;
  quantity_min: number | null;
  quantity_max: number | null;
  alternative_group: string | null;
  preparation: string | null;
  // Parsed fields the extractor produced (grocery-list metadata). Not edited in
  // this UI, but carried through so a grouped import/save doesn't null them out.
  quantity: string | null;
  unit: string | null;
  name: string | null;
  quantity_value: number | null;
}

export interface EditGroup {
  name: string;
  /** A whole section the source marked optional (e.g. "For the garnish"). */
  optional: boolean;
  ingredients: EditIngredient[];
}

export const blankIngredient = (): EditIngredient => ({
  display_text: "",
  optional: false,
  quantity_min: null,
  quantity_max: null,
  alternative_group: null,
  preparation: null,
  quantity: null,
  unit: null,
  name: null,
  quantity_value: null,
});

function RangeBadge({ min, max }: { min: number | null; max: number | null }) {
  // Only a genuine range (min < max). "160–160" is not a range — don't show it.
  if (min === null || max === null || min >= max) return null;
  return (
    <span className="rounded-full bg-basil-tint px-2 py-0.5 text-2xs font-semibold text-basil" title="Quantity range preserved from the source">
      {min}–{max}
    </span>
  );
}

export function GroupedIngredients({
  groups,
  setGroups,
}: {
  groups: EditGroup[];
  setGroups: (g: EditGroup[]) => void;
}) {
  const single = groups.length === 1 && !groups[0].name;

  const patchGroup = (gi: number, patch: Partial<EditGroup>) =>
    setGroups(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  const patchIngredient = (gi: number, ii: number, patch: Partial<EditIngredient>) =>
    setGroups(groups.map((g, i) => (i === gi ? { ...g, ingredients: g.ingredients.map((x, j) => (j === ii ? { ...x, ...patch } : x)) } : g)));

  const addIngredient = (gi: number) =>
    patchGroup(gi, { ingredients: [...groups[gi].ingredients, blankIngredient()] });

  const removeIngredient = (gi: number, ii: number) =>
    patchGroup(gi, { ingredients: groups[gi].ingredients.filter((_, j) => j !== ii) });

  const addSection = () => setGroups([...groups, { name: "", optional: false, ingredients: [blankIngredient()] }]);
  const removeSection = (gi: number) => setGroups(groups.filter((_, i) => i !== gi));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-ink-2">Ingredients</span>
        <button type="button" onClick={addSection} className="text-xs font-semibold text-basil">
          + Add section
        </button>
      </div>

      {groups.map((group, gi) => (
        <div key={gi} className="rounded-card border border-line bg-surface-2/40 p-3">
          {/* Section heading — hidden entirely for a single unnamed group (§18) */}
          {!single && (
            <div className="mb-2 flex items-center gap-2">
              <input
                value={group.name}
                onChange={(e) => patchGroup(gi, { name: e.target.value })}
                placeholder="Section name (e.g. For the sauce)"
                className="flex-1 rounded-sm border border-transparent bg-transparent px-1 py-1 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-line focus:bg-surface"
              />
              {groups.length > 1 && (
                <button type="button" onClick={() => removeSection(gi)} aria-label="Remove section" className="text-ink-3 hover:text-danger">
                  <CloseIcon size={15} />
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {group.ingredients.map((ing, ii) => (
              <div key={ii} className="flex items-center gap-2">
                <input
                  value={ing.display_text}
                  onChange={(e) => patchIngredient(gi, ii, { display_text: e.target.value })}
                  placeholder="500g chicken thighs"
                  className={`flex-1 rounded-sm border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-3 focus:border-basil ${ing.optional ? "italic text-ink-2" : ""}`}
                />
                <RangeBadge min={ing.quantity_min} max={ing.quantity_max} />
                {ing.alternative_group && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-3" title="One of two alternatives from the source">
                    or
                  </span>
                )}
                {ing.optional && (
                  <span className="rounded-full bg-basil-tint px-2 py-0.5 text-2xs font-semibold text-basil">optional</span>
                )}
                <button type="button" onClick={() => removeIngredient(gi, ii)} aria-label="Remove ingredient" className="text-ink-3 hover:text-danger">
                  <CloseIcon size={15} />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => addIngredient(gi)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-basil">
            <PlusIcon size={14} /> Add ingredient
          </button>
        </div>
      ))}
    </div>
  );
}
