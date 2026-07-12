"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { importFromUrl, isInstagramUrl } from "./pipeline";
import type { ExtractedRecipe, ImportOutcome } from "./types";

const DAILY_IMPORT_LIMIT = 25;

export type ImportState =
  | { phase: "idle" }
  | { phase: "error"; error: string }
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

  // Per-user rate limit (rolling 24h).
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
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
