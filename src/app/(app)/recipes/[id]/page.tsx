import { notFound } from "next/navigation";
import Link from "next/link";
import { getRecipe } from "@/lib/recipes/queries";
import { CoverImage } from "@/components/recipes/cover-image";
import { FavouriteButton } from "@/components/recipes/favourite-button";
import { DeleteButton } from "@/components/recipes/delete-button";
import { ChevronLeftIcon, PencilIcon } from "@/components/icons";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const metrics = [
    recipe.servings ? { n: recipe.servings, l: "Serves" } : null,
    { n: String(recipe.ingredients.length), l: "Ingredients" },
    { n: String(recipe.steps.length), l: "Steps" },
    recipe.prep_time ? { n: recipe.prep_time, l: "Prep" } : null,
    recipe.cook_time ? { n: recipe.cook_time, l: "Cook" } : null,
  ].filter((m): m is { n: string; l: string } => m !== null);

  return (
    <div className="-mt-2">
      <CoverImage url={recipe.coverUrl} title={recipe.title} className="-mx-[18px] h-[250px] p-[18px]">
        <Link
          href="/recipes"
          aria-label="Back"
          className="absolute left-4 top-4 grid h-[38px] w-[38px] place-items-center rounded-full bg-white/85 text-ink"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <div className="absolute right-4 top-4 flex gap-2">
          <FavouriteButton id={recipe.id} initial={recipe.is_favourite} />
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

      {recipe.ingredients.length > 0 && (
        <section>
          <SectionHeading>Ingredients</SectionHeading>
          <ul className="overflow-hidden rounded-card border border-line bg-surface">
            {recipe.ingredients.map((ing) => {
              const qty = [ing.quantity, ing.unit].filter(Boolean).join(" ");
              return (
                <li
                  key={ing.id}
                  className="flex items-center gap-3 border-b border-line-2 px-4 py-3 text-[14px] last:border-b-0"
                >
                  {qty && <span className="min-w-[64px] font-semibold text-ink">{qty}</span>}
                  <span className="text-ink-2">{ing.name ?? ing.display_text}</span>
                </li>
              );
            })}
          </ul>
        </section>
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
                <p className="pt-1 text-[14px] leading-relaxed text-ink-2">{step.instruction}</p>
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
          className="mt-5 block text-center text-[13px] font-semibold text-basil"
        >
          View the original
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
