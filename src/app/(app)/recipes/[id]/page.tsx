import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe } from "@/lib/recipes/queries";
import { CoverImage, DETAIL_COVER } from "@/components/recipes/cover-image";
import { FavouriteButton } from "@/components/recipes/favourite-button";
import { ShareButton } from "@/components/recipes/share-button";
import { DeleteButton } from "@/components/recipes/delete-button";
import { IngredientsSection } from "@/components/recipes/ingredients-section";
import { SavedToast } from "@/components/recipes/saved-toast";
import { listedIngredientIds } from "@/lib/grocery/queries";
import { CREATED_PARAM } from "@/lib/recipes/constants";
import { highlightStep, ingredientTerms } from "@/lib/recipes/highlight";
import { attributionLabel } from "@/lib/recipes/handle";
import {
  ChevronLeftIcon,
  PencilIcon,
  InstagramIcon,
  TikTokIcon,
  GlobeIcon,
} from "@/components/icons";

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const created = (await searchParams)[CREATED_PARAM];
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const addedIngredientIds = await listedIngredientIds(recipe.id);
  const stepTerms = ingredientTerms(recipe.ingredients);

  const metrics = [
    { n: String(recipe.ingredients.length), l: "Ingredients" },
    { n: String(recipe.steps.length), l: "Steps" },
    recipe.prep_time ? { n: recipe.prep_time, l: "Prep" } : null,
    recipe.cook_time ? { n: recipe.cook_time, l: "Cook" } : null,
  ].filter((m): m is { n: string; l: string } => m !== null);

  return (
    <div className="-mt-2">
      {created && <SavedToast recipeId={recipe.id} message={`Saved “${recipe.title}”`} />}
      <CoverImage url={recipe.coverUrl} title={recipe.title} className={DETAIL_COVER}>
        <Link
          href="/recipes"
          aria-label="Back"
          className="absolute left-4 top-4 grid h-[38px] w-[38px] place-items-center rounded-full bg-white/85 text-ink"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <div className="absolute right-4 top-4 flex gap-2">
          <FavouriteButton id={recipe.id} initial={recipe.is_favourite} />
          <ShareButton recipe={recipe} />
          <Link
            href={`/recipes/${recipe.id}/edit`}
            aria-label="Edit recipe"
            className="grid h-[38px] w-[38px] place-items-center rounded-full bg-white/85 text-ink"
          >
            <PencilIcon size={16} />
          </Link>
        </div>
        <h1 className="relative text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.35)] [text-wrap:balance]">
          {recipe.title}
        </h1>
      </CoverImage>

      {recipe.source_handle && (
        <p className="mt-3 text-[13px] font-semibold text-basil">
          via {attributionLabel(recipe.source_handle, { at: recipe.source_type === "instagram" })}
        </p>
      )}

      {recipe.description && (
        <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{recipe.description}</p>
      )}

      {metrics.length > 0 && (
        <div className="mt-4 flex gap-2">
          {metrics.map((m) => (
            <div key={m.l} className="flex-1 rounded-[14px] border border-line bg-surface px-2 py-3 text-center">
              <div className="text-[15px] font-bold">{m.n}</div>
              <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.05em] text-ink-3">{m.l}</div>
            </div>
          ))}
        </div>
      )}

      {(() => {
        const nutrients = [
          { l: "Calories", v: recipe.calories },
          { l: "Protein", v: recipe.protein },
          { l: "Carbs", v: recipe.carbs },
          { l: "Fat", v: recipe.fat },
          { l: "Fibre", v: recipe.fibre },
          { l: "Sugar", v: recipe.sugar },
        ].filter((n) => n.v);
        if (nutrients.length === 0) return null;
        return (
          <div className="mt-3">
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-ink-3">
              Nutrition per serving
            </p>
            <div className="grid grid-cols-3 gap-2">
              {nutrients.map((n) => (
                <div
                  key={n.l}
                  className="rounded-[14px] border border-line bg-surface px-2 py-3 text-center"
                >
                  <div className="text-[15px] font-bold">{n.v}</div>
                  <div className="mt-0.5 text-[10.5px] uppercase tracking-[0.05em] text-ink-3">{n.l}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {recipe.ingredients.length > 0 && (
        <IngredientsSection
          recipeId={recipe.id}
          ingredients={recipe.ingredients}
          groups={recipe.ingredientGroups}
          servingsText={recipe.servings}
          addedIngredientIds={addedIngredientIds}
        />
      )}

      {recipe.steps.length > 0 && (
        <section>
          <SectionHeading>Method</SectionHeading>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, i) => (
              <li key={step.id} className="flex gap-3.5">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-basil-tint text-[13px] font-bold text-basil">
                  {i + 1}
                </span>
                <div className="pt-1">
                  {step.title && (
                    <p className="mb-0.5 text-[14px] font-bold text-ink">{step.title}</p>
                  )}
                  <p className="text-[14px] leading-relaxed text-ink-2">
                    {highlightStep(step.instruction, stepTerms).map((seg, j) =>
                      seg.bold ? (
                        <strong key={j} className="font-semibold text-ink">
                          {seg.text}
                        </strong>
                      ) : (
                        <span key={j}>{seg.text}</span>
                      ),
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recipe.tips.length > 0 && (
        <section>
          <SectionHeading>Tips</SectionHeading>
          <div className="flex flex-col gap-2">
            {recipe.tips.map((tip) => (
              <p key={tip.id} className="rounded-[14px] bg-basil-tint px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-2">
                {tip.text}
              </p>
            ))}
          </div>
        </section>
      )}

      {recipe.source_url && (
        <a
          href={recipe.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-basil"
        >
          <PlatformIcon url={recipe.source_url} /> View the original
        </a>
      )}

      <div className="mt-6">
        <DeleteButton id={recipe.id} />
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-3">{children}</h2>
  );
}

function PlatformIcon({ url }: { url: string }) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // fall through to the globe
  }
  if (host.endsWith("instagram.com")) return <InstagramIcon size={15} />;
  if (host.endsWith("tiktok.com")) return <TikTokIcon size={15} />;
  return <GlobeIcon size={15} />;
}
