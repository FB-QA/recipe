"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { signStoragePaths } from "@/lib/supabase/storage";
import { importFromUrl, isInstagramUrl } from "./pipeline";
import { extractWithAi, aiToExtracted } from "./ai";
import { hasCookableContent, type ExtractedRecipe, type ImportOutcome } from "./types";

const DAILY_IMPORT_LIMIT = 25;
const IMPORT_WINDOW_MS = 24 * 3600 * 1000;

/** Start of the rolling import-limit window, as an ISO timestamp. */
function windowCutoff() {
  return new Date(Date.now() - IMPORT_WINDOW_MS).toISOString();
}

export type PasteState =
  | { phase: "idle" }
  | { phase: "error"; error: string }
  | { phase: "done"; recipe: ExtractedRecipe };

/** Extract a recipe from raw pasted text (e.g. from ChatGPT or a blog). Same AI
 *  path as caption/website import — no particular format required. */
export async function extractPasted(
  _prev: PasteState | undefined,
  formData: FormData,
): Promise<PasteState> {
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 20) {
    return { phase: "error", error: "Paste a bit more — I need the full recipe text." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { phase: "error", error: "You've been signed out — log in and try again." };

  const cutoff = windowCutoff();
  const { data: recent } = await supabase.rpc("imports_since", { cutoff });
  if ((recent ?? 0) >= DAILY_IMPORT_LIMIT) {
    return {
      phase: "error",
      error: "You've reached today's import limit. Try again tomorrow, or type it in manually.",
    };
  }

  const ai = await extractWithAi(text);
  const recipe = ai ? aiToExtracted(ai.recipe, null) : null;
  const ok = recipe !== null && hasCookableContent(recipe);

  await supabase.from("recipe_imports").insert({
    user_id: user.id,
    source_url: null,
    source_type: "manual",
    status: ok ? "success" : "no_recipe",
    method: "ai_text",
    estimated_cost_cents: Number((ai?.costCents ?? 0).toFixed(4)),
    extracted: ok ? recipe : null,
  });

  if (!ok || !recipe) {
    return {
      phase: "error",
      error:
        "I couldn't pull a full recipe from that. Make sure the ingredients and steps are in the text, or type it in manually.",
    };
  }
  return { phase: "done", recipe };
}

export type ImportState =
  | { phase: "idle" }
  | { phase: "error"; error: string }
  | { phase: "exists"; recipeId: string; title: string; coverUrl: string | null }
  | ({ phase: "done"; sourceUrl: string } & ImportOutcome);

export async function runImport(
  _prev: ImportState | undefined,
  formData: FormData,
): Promise<ImportState> {
  const parsed = z
    .string()
    .url()
    .safeParse(String(formData.get("url") ?? "").trim());
  if (!parsed.success) {
    return { phase: "error", error: "Paste a valid recipe link to import." };
  }
  const url = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { phase: "error", error: "You've been signed out — log in and try again." };

  // Already saved this URL? Send them straight to it instead of re-importing.
  const { data: existing } = await supabase
    .from("recipes")
    .select("id, title, cover_image_path")
    .eq("source_url", url)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const covers = await signStoragePaths(supabase, [existing.cover_image_path]);
    return {
      phase: "exists",
      recipeId: existing.id,
      title: existing.title,
      coverUrl: existing.cover_image_path ? (covers[existing.cover_image_path] ?? null) : null,
    };
  }

  // Per-user rate limit (rolling 24h).
  const cutoff = windowCutoff();
  const { data: recent } = await supabase.rpc("imports_since", { cutoff });
  if ((recent ?? 0) >= DAILY_IMPORT_LIMIT) {
    return {
      phase: "error",
      error: "You've reached today's import limit. It resets in 24 hours — or add a recipe manually.",
    };
  }

  // Cache: a previous successful import of the same URL is reused for free.
  const { data: cached } = await supabase
    .from("recipe_imports")
    .select("extracted, media_url, source_type")
    .eq("source_url", url)
    .eq("status", "success")
    .not("extracted", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.extracted) {
    return {
      phase: "done",
      status: "success",
      sourceType: cached.source_type === "instagram" ? "instagram" : "website",
      method: "cache",
      costCents: 0,
      recipe: cached.extracted as unknown as ExtractedRecipe,
      mediaUrl: cached.media_url,
      sourceUrl: url,
    };
  }

  const outcome = await importFromUrl(url);

  await supabase.from("recipe_imports").insert({
    user_id: user.id,
    source_url: url,
    source_type:
      outcome.status === "failed" ? (isInstagramUrl(url) ? "instagram" : "website") : outcome.sourceType,
    status: outcome.status,
    method: "method" in outcome ? outcome.method : null,
    estimated_cost_cents: Number(outcome.costCents.toFixed(4)),
    extracted: outcome.status === "success" ? outcome.recipe : null,
    media_url: "mediaUrl" in outcome ? (outcome.mediaUrl ?? null) : null,
    error: outcome.status === "failed" ? outcome.error : null,
  });

  if (outcome.status === "failed") return { phase: "error", error: outcome.error };
  return { phase: "done", sourceUrl: url, ...outcome };
}
