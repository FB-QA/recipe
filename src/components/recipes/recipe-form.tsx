"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/text-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { CloseIcon, PlusIcon } from "@/components/icons";
import type { RecipeFormState } from "@/lib/recipes/actions";
import { createdRecipeHref } from "@/lib/recipes/constants";
import { useToast } from "@/components/ui/toast";
import { compressRecipeImage, ImageCompressionError } from "@/lib/images/compress-client";

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
  isNew,
  onSaved,
}: {
  action: (prev: RecipeFormState, fd: FormData) => Promise<RecipeFormState>;
  initial?: RecipeFormInitial;
  submitLabel: string;
  source?: { type: "instagram" | "website"; url: string | null; handle?: string | null };
  importCoverUrl?: string | null;
  /** Newly-created recipe (adds ?created=1 so the detail page toasts "Saved"). */
  isNew?: boolean;
  /** Host handles navigation on save (e.g. a drawer closes then routes). When
   * omitted, the form navigates to the saved recipe itself. */
  onSaved?: (id: string) => void;
}) {
  const [state, formAction] = useActionState<RecipeFormState, FormData>(action, undefined);
  const router = useRouter();
  const toast = useToast();
  const handled = useRef(false);

  // On a successful save the action returns the id (never redirects), so the
  // client owns navigation — this is the single place it happens.
  useEffect(() => {
    if (!state || !("ok" in state) || handled.current) return;
    handled.current = true;
    if (state.coverWarning) toast(state.coverWarning);
    if (onSaved) onSaved(state.id);
    else router.push(isNew ? createdRecipeHref(state.id) : `/recipes/${state.id}`);
  }, [state, onSaved, isNew, router, toast]);

  const formError = state && "error" in state ? state.error : undefined;

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [servings, setServings] = useState(initial.servings);
  const [prep, setPrep] = useState(initial.prep_time);
  const [cook, setCook] = useState(initial.cook_time);
  const [ingredients, setIngredients] = useState<string[]>(
    initial.ingredients.length ? initial.ingredients : [""],
  );
  const [steps, setSteps] = useState<string[]>(initial.steps.length ? initial.steps : [""]);
  const [tips, setTips] = useState<string[]>(initial.tips);

  // A remote import cover (e.g. an Instagram thumbnail) is hotlink-blocked in the
  // browser, so preview it through our proxy. The hidden field still carries the
  // raw URL — the server fetches and stores it directly on save.
  const importPreviewSrc =
    importCoverUrl && /^https?:\/\//.test(importCoverUrl)
      ? `/api/image-proxy?url=${encodeURIComponent(importCoverUrl)}`
      : (importCoverUrl ?? null);
  const [preview, setPreview] = useState<string | null>(importPreviewSrc ?? initial.coverUrl);
  const [coverAction, setCoverAction] = useState<"keep" | "replace" | "remove">("keep");
  const fileRef = useRef<HTMLInputElement>(null);
  // The compressed WebP we actually upload. The raw <input> file never goes over
  // the wire — the input carries no `name`; this is injected into the FormData.
  const compressedRef = useRef<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // Compress on the client, then hand the small WebP to the server action.
  const dispatch = (fd: FormData) => {
    if (compressedRef.current) fd.set("cover", compressedRef.current);
    return formAction(fd);
  };

  const payload = {
    title: title.trim(),
    description: description.trim() || null,
    servings: servings.trim() || null,
    prep_time: prep.trim() || null,
    cook_time: cook.trim() || null,
    source_url: source?.url ?? initial.source_url ?? null,
    source_type: source?.type ?? ("manual" as const),
    source_handle: source?.handle ?? null,
    tags: [] as string[],
    ingredients: ingredients.filter((x) => x.trim()).map((t) => ({ display_text: t.trim() })),
    steps: steps.filter((x) => x.trim()).map((t) => ({ instruction: t.trim() })),
    tips: tips.filter((x) => x.trim()).map((t) => t.trim()),
  };

  return (
    <form action={dispatch} className="flex flex-col gap-5 pb-4">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <input type="hidden" name="coverAction" value={coverAction} />
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
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[13px] text-ink-3">Add a photo (optional)</span>
          )}
          <div className="absolute bottom-2.5 right-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={compressing}
              className="rounded-full bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-ink shadow-sm disabled:opacity-60"
            >
              {compressing ? "Optimising…" : preview ? "Change" : "Add photo"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setCoverAction("remove");
                  setCoverError(null);
                  compressedRef.current = null;
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
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setCoverError(null);
            setCompressing(true);
            try {
              const optimised = await compressRecipeImage(file);
              compressedRef.current = optimised;
              setPreview(URL.createObjectURL(optimised));
              setCoverAction("replace");
            } catch (err) {
              compressedRef.current = null;
              if (fileRef.current) fileRef.current.value = "";
              setCoverError(
                err instanceof ImageCompressionError
                  ? err.message
                  : "Couldn't process that photo. Try another.",
              );
            } finally {
              setCompressing(false);
            }
          }}
        />
        {coverError && (
          <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
            {coverError}
          </p>
        )}
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

      <DynamicList
        label="Ingredients"
        items={ingredients}
        setItems={setIngredients}
        placeholder="2 chicken breasts"
        addLabel="Add ingredient"
      />

      <DynamicList
        label="Method"
        items={steps}
        setItems={setSteps}
        placeholder="Describe this step…"
        addLabel="Add step"
        numbered
        multiline
      />

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

      <SubmitButton fullWidth disabled={compressing}>{submitLabel}</SubmitButton>
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
