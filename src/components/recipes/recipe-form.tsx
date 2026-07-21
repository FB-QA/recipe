"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Spinner } from "@/components/ui/spinner";
import { CloseIcon, PlusIcon } from "@/components/icons";
import type { RecipeFormState } from "@/lib/recipes/actions";
import { createdRecipeHref } from "@/lib/recipes/constants";
import { GroupedIngredients, type EditGroup } from "@/components/recipes/grouped-ingredients";
import { downscaleImage } from "@/lib/images/downscale";

/** A method step and its optional (import-provided) heading, kept together. */
type StepEdit = { instruction: string; title: string | null };

export type RecipeFormInitial = {
  title: string;
  description: string;
  servings: string;
  prep_time: string;
  cook_time: string;
  source_url: string;
  ingredients: string[];
  steps: string[];
  tips: string[];
  coverUrl: string | null;
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  fibre?: string;
  sugar?: string;
  /** Whether the nutrition figures are per serving (true), whole recipe (false),
   *  or unstated (null). Carried through save; drives the detail-page label. */
  nutrition_per_serving?: boolean | null;
  /** Structured ingredient sections (imports + v2 recipes). When present the
   *  form renders the group-aware editor and submits `ingredientGroups`. */
  groups?: EditGroup[];
  /** Step titles parallel to `steps`, when the source gave meaningful ones. */
  stepTitles?: (string | null)[];
};

const EMPTY: RecipeFormInitial = {
  title: "",
  description: "",
  servings: "",
  prep_time: "",
  cook_time: "",
  source_url: "",
  ingredients: [""],
  steps: [""],
  tips: [],
  coverUrl: null,
};

export function RecipeForm({
  action,
  initial = EMPTY,
  submitLabel,
  source,
  importCoverUrl,
  importId,
  coverEnriching,
  isNew,
  onSaved,
}: {
  action: (prev: RecipeFormState, fd: FormData) => Promise<RecipeFormState>;
  initial?: RecipeFormInitial;
  submitLabel: string;
  source?: { type: "instagram" | "website"; url: string | null; handle?: string | null };
  importCoverUrl?: string | null;
  /** When confirming an import draft: links the saved recipe back to its import row. */
  importId?: string;
  /** The deferred Reel cover is still being fetched — show a shimmer on the cover. */
  coverEnriching?: boolean;
  /** Newly-created recipe (adds ?created=1 so the detail page toasts "Saved"). */
  isNew?: boolean;
  /** Host handles navigation on save (e.g. a drawer closes then routes). When
   * omitted, the form navigates to the saved recipe itself. */
  onSaved?: (id: string) => void;
}) {
  const [state, formAction] = useActionState<RecipeFormState, FormData>(action, undefined);
  const router = useRouter();
  const handled = useRef(false);

  // On a successful save the action returns the id (never redirects), so the
  // client owns navigation — this is the single place it happens.
  useEffect(() => {
    if (!state || !("ok" in state) || handled.current) return;
    handled.current = true;
    if (onSaved) onSaved(state.id);
    else router.push(isNew ? createdRecipeHref(state.id) : `/recipes/${state.id}`);
  }, [state, onSaved, isNew, router]);

  const formError = state && "error" in state ? state.error : undefined;

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [servings, setServings] = useState(initial.servings);
  const [prep, setPrep] = useState(initial.prep_time);
  const [cook, setCook] = useState(initial.cook_time);
  const [ingredients, setIngredients] = useState<string[]>(
    initial.ingredients.length ? initial.ingredients : [""],
  );
  // Grouped mode: present only when the recipe carries sections.
  const grouped = Boolean(initial.groups && initial.groups.length > 0);
  const [groups, setGroups] = useState<EditGroup[]>(initial.groups ?? []);
  // Steps carry their (import-provided) title bound to the instruction, so
  // inserting or deleting a step before saving can't shift titles onto the wrong
  // step the way a parallel-by-index array did.
  const [steps, setSteps] = useState<StepEdit[]>(
    initial.steps.length
      ? initial.steps.map((instruction, i) => ({ instruction, title: initial.stepTitles?.[i] ?? null }))
      : [{ instruction: "", title: null }],
  );
  const [calories, setCalories] = useState(initial.calories ?? "");
  const [protein, setProtein] = useState(initial.protein ?? "");
  const [carbs, setCarbs] = useState(initial.carbs ?? "");
  const [fat, setFat] = useState(initial.fat ?? "");
  const [fibre, setFibre] = useState(initial.fibre ?? "");
  const [sugar, setSugar] = useState(initial.sugar ?? "");
  // Not surfaced as a control (it's source-stated metadata); carried so an
  // imported whole-recipe value persists instead of always saving null.
  const nutritionPerServing = initial.nutrition_per_serving ?? null;
  const [tips, setTips] = useState<string[]>(initial.tips);

  // A remote import cover (e.g. an Instagram thumbnail) is hotlink-blocked in the
  // browser, so preview it through our proxy. The hidden field still carries the
  // raw URL — the server fetches and stores it directly on save.
  const importPreviewSrc =
    importCoverUrl && /^https?:\/\//.test(importCoverUrl)
      ? `/api/image-proxy?url=${encodeURIComponent(importCoverUrl)}`
      : (importCoverUrl ?? null);
  // `preview` holds only a user override (a chosen file, or `null` after Remove).
  // While the cover is "kept", the shown image is derived from `importCoverUrl` so
  // it follows the deferred cover enrichment swapping the composite → clean image.
  const [preview, setPreview] = useState<string | null>(null);
  const [coverAction, setCoverAction] = useState<"keep" | "replace" | "remove">("keep");
  const displayed = coverAction === "keep" ? (importPreviewSrc ?? initial.coverUrl) : preview;
  const fileRef = useRef<HTMLInputElement>(null);
  // Cover downscale is async: a monotonic token identifies the latest selection so
  // a slower earlier conversion can't overwrite a newer one, and `converting`
  // blocks Save until the resized file is actually installed on the input.
  const coverSelection = useRef(0);
  const [converting, setConverting] = useState(false);

  const payload = {
    title: title.trim(),
    description: description.trim() || null,
    servings: servings.trim() || null,
    prep_time: prep.trim() || null,
    cook_time: cook.trim() || null,
    calories: calories.trim() || null,
    protein: protein.trim() || null,
    carbs: carbs.trim() || null,
    fat: fat.trim() || null,
    fibre: fibre.trim() || null,
    sugar: sugar.trim() || null,
    nutrition_per_serving: nutritionPerServing,
    source_url: source?.url ?? initial.source_url ?? null,
    source_type: source?.type ?? ("manual" as const),
    source_handle: source?.handle ?? null,
    tags: [] as string[],
    // Flat ingredients still submitted in non-grouped mode (manual/legacy).
    ingredients: grouped ? [] : ingredients.filter((x) => x.trim()).map((t) => ({ display_text: t.trim() })),
    ingredientGroups: grouped
      ? groups.map((g) => ({
          name: g.name.trim() || null,
          optional: g.optional,
          ingredients: g.ingredients
            .filter((i) => i.display_text.trim())
            .map((i) => ({
              display_text: i.display_text.trim(),
              quantity: i.quantity,
              unit: i.unit,
              name: i.name,
              quantity_value: i.quantity_value,
              quantity_min: i.quantity_min,
              quantity_max: i.quantity_max,
              preparation: i.preparation,
              optional: i.optional,
              alternative_group: i.alternative_group,
            })),
        }))
      : undefined,
    steps: steps
      .map((s) => ({ instruction: s.instruction.trim(), title: s.title?.trim() || null }))
      .filter((s) => s.instruction),
    tips: tips.filter((x) => x.trim()).map((t) => t.trim()),
  };

  return (
    <form action={formAction} className="flex flex-col gap-5 pb-4">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <input type="hidden" name="coverAction" value={coverAction} />
      {importId && <input type="hidden" name="importId" value={importId} />}
      {/* When importing, the untouched cover is a remote thumbnail the server
          fetches + optimises. A chosen file or a removal overrides it. */}
      <input
        type="hidden"
        name="importCoverUrl"
        value={coverAction === "keep" ? (importCoverUrl ?? "") : ""}
      />

      {/* Cover */}
      <div>
        <FieldLabel>Cover photo</FieldLabel>
        <div className="relative flex h-[168px] items-center justify-center overflow-hidden rounded-card border border-dashed border-line bg-surface-2">
          {displayed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayed} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[13px] text-ink-3">Add a photo (optional)</span>
          )}
          {/* Deferred cover enrichment in flight: a subtle shimmer + spinner over the
              composite thumbnail while the clean cover is fetched (spec §4). */}
          {coverEnriching && coverAction === "keep" && displayed && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span aria-hidden className="skeleton absolute inset-0 opacity-40" />
              <span className="relative rounded-full bg-black/35 p-2 backdrop-blur-[1px]">
                <Spinner size={16} tone="white" />
              </span>
            </div>
          )}
          <div className="absolute bottom-2.5 right-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-sm"
            >
              {displayed ? "Change" : "Add photo"}
            </button>
            {displayed && (
              <button
                type="button"
                onClick={() => {
                  coverSelection.current++; // discard any in-flight conversion
                  setConverting(false);
                  setPreview(null);
                  setCoverAction("remove");
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-danger shadow-sm"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          name="cover"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const input = e.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            // Shrink big images (e.g. multi-MB PNG screenshots) in the browser and
            // put the result back on the input, so what uploads stays small enough
            // to clear the serverless body limit that was rejecting them.
            const token = ++coverSelection.current;
            setConverting(true);
            const resized = await downscaleImage(file);
            // A newer selection or a Remove happened while converting → discard this.
            if (token !== coverSelection.current) return;
            if (resized !== file) {
              const dt = new DataTransfer();
              dt.items.add(resized);
              input.files = dt.files;
            }
            setPreview(URL.createObjectURL(resized));
            setCoverAction("replace");
            setConverting(false);
          }}
        />
      </div>

      <TextField
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Greek chicken burgers"
        error={formError && !title.trim() ? formError : undefined}
        required
      />

      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="A line about this recipe (optional)"
          className="w-full rounded-sm border border-line bg-surface-2 px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
        />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <TextField label="Serves" value={servings} onChange={(e) => setServings(e.target.value)} placeholder="2" />
        <TextField label="Prep" value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="10 min" />
        <TextField label="Cook" value={cook} onChange={(e) => setCook(e.target.value)} placeholder="20 min" />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <TextField label="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="480 kcal" />
        <TextField label="Protein" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="45g" />
        <TextField label="Carbs" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="" />
        <TextField label="Fat" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="" />
        <TextField label="Fibre" value={fibre} onChange={(e) => setFibre(e.target.value)} placeholder="10g" />
        <TextField label="Sugar" value={sugar} onChange={(e) => setSugar(e.target.value)} placeholder="" />
      </div>

      {grouped ? (
        <GroupedIngredients groups={groups} setGroups={setGroups} />
      ) : (
        <DynamicList
          label="Ingredients"
          items={ingredients}
          setItems={setIngredients}
          placeholder="2 chicken breasts"
          addLabel="Add ingredient"
        />
      )}

      <MethodEditor steps={steps} setSteps={setSteps} />

      <DynamicList
        label="Tips"
        items={tips}
        setItems={setTips}
        placeholder="A handy note (optional)"
        addLabel="Add tip"
        allowEmpty
      />

      {formError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      )}

      <SubmitButton fullWidth disabled={converting}>
        {converting ? "Preparing image…" : submitLabel}
      </SubmitButton>
    </form>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">
      {children}
    </div>
  );
}

/**
 * The method editor. Mirrors DynamicList's numbered/multiline look but operates
 * on {instruction, title} pairs so a step's imported heading stays attached to
 * it through inserts, deletes and reorders. Titles aren't directly editable
 * (they come from imports); editing an instruction never detaches its title.
 */
function MethodEditor({
  steps,
  setSteps,
}: {
  steps: StepEdit[];
  setSteps: (next: StepEdit[]) => void;
}) {
  const list = steps.length === 0 ? [{ instruction: "", title: null }] : steps;
  const update = (i: number, instruction: string) =>
    setSteps(list.map((s, idx) => (idx === i ? { ...s, instruction } : s)));
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    setSteps(next.length === 0 ? [{ instruction: "", title: null }] : next);
  };
  const add = () => setSteps([...list, { instruction: "", title: null }]);

  return (
    <div>
      <FieldLabel>Method</FieldLabel>
      <div className="flex flex-col gap-2">
        {list.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-basil-tint text-[12px] font-bold text-basil">
              {i + 1}
            </span>
            <div className="flex w-full flex-col gap-1">
              {step.title && (
                <span className="text-[12px] font-semibold text-ink-2">{step.title}</span>
              )}
              <textarea
                value={step.instruction}
                aria-label={`Method ${i + 1}`}
                onChange={(e) => update(i, e.target.value)}
                placeholder="Describe this step…"
                rows={2}
                className="w-full rounded-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
              />
            </div>
            <button
              type="button"
              aria-label={`Remove Method ${i + 1}`}
              onClick={() => remove(i)}
              className="mt-1.5 grid h-8 w-8 flex-none place-items-center rounded-full text-ink-3 hover:text-danger"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-basil"
      >
        <PlusIcon size={16} /> Add step
      </button>
    </div>
  );
}

function DynamicList({
  label,
  items,
  setItems,
  placeholder,
  addLabel,
  numbered,
  multiline,
  allowEmpty,
}: {
  label: string;
  items: string[];
  setItems: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  numbered?: boolean;
  multiline?: boolean;
  allowEmpty?: boolean;
}) {
  const list = items.length === 0 && !allowEmpty ? [""] : items;

  const update = (i: number, value: string) => setItems(list.map((v, idx) => (idx === i ? value : v)));
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    setItems(next.length === 0 && !allowEmpty ? [""] : next);
  };
  const add = () => setItems([...list, ""]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-2">
        {list.map((value, i) => (
          <div key={i} className="flex items-start gap-2">
            {numbered && (
              <span className="mt-2.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-basil-tint text-[12px] font-bold text-basil">
                {i + 1}
              </span>
            )}
            {multiline ? (
              <textarea
                value={value}
                aria-label={`${label} ${i + 1}`}
                onChange={(e) => update(i, e.target.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full rounded-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
              />
            ) : (
              <input
                value={value}
                aria-label={`${label} ${i + 1}`}
                onChange={(e) => update(i, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-sm border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-3 focus:border-basil"
              />
            )}
            <button
              type="button"
              aria-label={`Remove ${label} ${i + 1}`}
              onClick={() => remove(i)}
              className="mt-1.5 grid h-8 w-8 flex-none place-items-center rounded-full text-ink-3 hover:text-danger"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-basil"
      >
        <PlusIcon size={16} /> {addLabel}
      </button>
    </div>
  );
}
