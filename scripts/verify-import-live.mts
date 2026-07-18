/**
 * Live verification (throwaway) — exercises the two real external calls the
 * unit tests mock: a live recipe site's JSON-LD, and a real Claude extraction
 * returning schema-valid structured output. No database involved.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-import-live.mts
 */
import { interpretWebsiteHtml } from "@/lib/import/resolvers/website";
import { createAnthropicProvider } from "@/lib/import/providers/anthropic";
import { normaliseRecipe, qualityScore, minimumUsable } from "@/lib/import/validate";
import { aiExtractedRecipeSchema } from "@/lib/import/schema";
import type { NormalizedImportInput } from "@/lib/import/schema";

const line = (s: string) => console.log(s);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";

async function verifyWebsite() {
  line("\n=== 1. Live website JSON-LD (deterministic, zero AI) ===");
  const urls = [
    "https://www.recipetineats.com/spaghetti-bolognese/",
    "https://cafedelites.com/creamy-garlic-butter-chicken/",
    "https://www.budgetbytes.com/creamy-garlic-pasta/",
    "https://natashaskitchen.com/pancake-recipe/",
  ];
  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { "user-agent": UA } });
    } catch (e) {
      line(`  ${url} → fetch error ${(e as Error).message}`);
      continue;
    }
    line(`GET ${url} → HTTP ${res.status}`);
    if (!res.ok) continue;
    const seen = interpretWebsiteHtml(await res.text());
    if (seen.deterministicRecipe) {
      const r = seen.deterministicRecipe;
      const ings = r.ingredientGroups.reduce((n, g) => n + g.ingredients.length, 0);
      line(`  ✓ deterministic JSON-LD: "${r.title}" — ${ings} ingredients, ${r.steps.length} steps, prep ${r.prepTimeMinutes}m cook ${r.cookTimeMinutes}m`);
      line(`  first ingredient (verbatim): "${r.ingredientGroups[0].ingredients[0]?.originalText}"`);
      line(`  → this path spends ZERO AI attempts (AC1)`);
      return;
    }
    line(`  reachable but no usable JSON-LD; would fall to AI over ${seen.caption?.length ?? 0} chars of text`);
    return;
  }
  line("  (all candidate sites bot-blocked — same server-fetch hostility as Instagram; parser is unit-verified)");
}

async function verifyClaude() {
  line("\n=== 2. Live Claude extraction (schema-valid structured output) ===");
  const text = `Roasted Strawberry Cheesecake Pots

Serves 4. Prep 20 min, cook 15 min.

For the base:
- 1-2 tbsp melted butter
- 6 digestive biscuits, crushed

For the topping:
- 400g strawberries, hulled
- 15-20g toasted pecans OR 1 extra digestive biscuit
- 200g cream cheese
- 2 tbsp honey (optional)

Method:
1. Roast the strawberries: toss with a little sugar, roast 15 min at 200C.
2. Make the base: mix biscuits and butter, press into pots.
3. Combine and chill: whip cream cheese with honey, layer over base, top with strawberries and pecans. Chill 1 hour.`;

  const provider = createAnthropicProvider();
  const input: NormalizedImportInput = {
    sourceType: "pasted_text", modality: "text", text, evidenceWarnings: [],
  };
  if (!provider.supports(input)) { line("  ✗ provider unsupported (missing/short API key)"); return; }

  const t0 = Date.now();
  const result = await provider.extract(input, {});
  const ms = Date.now() - t0;
  line(`  model ${provider.modelId} → ok=${result.ok}, ${ms}ms, tokens in/out ${result.usage.inputTextTokens}/${result.usage.outputTokensTotal}`);
  if (!result.ok) { line(`  ✗ errorCode=${result.errorCode} ${result.errorMessageSafe}`); return; }

  const parsed = aiExtractedRecipeSchema.safeParse(result.recipe);
  if (!parsed.success) { line(`  ✗ schema-invalid: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}`); return; }
  const norm = normaliseRecipe(parsed.data);
  line(`  ✓ schema-valid. status=${norm.extractionStatus}, minimumUsable=${minimumUsable(norm)}, quality=${qualityScore(norm)}/100`);
  line(`  groups: ${norm.ingredientGroups.map((g) => g.name ?? "(unnamed)").join(", ")}`);
  const withRange = norm.ingredientGroups.flatMap((g) => g.ingredients).find((i) => i.quantityMin !== null);
  line(`  range preserved: ${withRange ? `"${withRange.originalText}" → min ${withRange.quantityMin} max ${withRange.quantityMax}` : "none found"}`);
  const withAlt = norm.ingredientGroups.flatMap((g) => g.ingredients).find((i) => i.alternativeGroupId !== null);
  line(`  alternative detected: ${withAlt ? `"${withAlt.originalText}"` : "none"}`);
  const optional = norm.ingredientGroups.flatMap((g) => g.ingredients).filter((i) => i.optional).map((i) => i.name);
  line(`  optional ingredients: ${optional.length ? optional.join(", ") : "none"}`);
  const titledSteps = norm.steps.filter((s) => s.title).map((s) => s.title);
  line(`  step titles: ${titledSteps.length ? titledSteps.join(" | ") : "none"}`);
}

await verifyWebsite();
await verifyClaude();
line("\nDone.");
