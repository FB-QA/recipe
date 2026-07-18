import type { EvidenceDecision, SourceEvidence } from "./schema";

/**
 * §10 — the evidence acceptance gate. Valid retrieval is not enough: the
 * evidence must plausibly contain the recipe before any AI money is spent.
 * "Never accept a recipe merely because the model produced a title, two
 * plausible ingredients and a generic method" — this gate runs BEFORE the
 * model, so the model never sees insufficient evidence at all.
 */

const MEASUREMENT_UNITS =
  /\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|oz|lb|lbs|tbsp|tsp|cups?|cloves?|slices?|cans?|tins?|sticks?|pinch(?:es)?)\b/gi;

const INSTRUCTION_VERBS =
  /\b(?:mix|stir|bake|fry|simmer|boil|whisk|chop|dice|slice|preheat|roast|grill|combine|fold|knead|marinate|season|drain|serve|cook|add|heat|blend|melt|pour)\b/gi;

const INGREDIENT_HEADER = /\b(?:ingredients?|method|instructions?|directions?|steps?)\b[:\s]/i;

const RECIPE_IN_BIO = /\brecipe\s+(?:is\s+)?(?:in|on)\s+(?:my\s+|the\s+)?(?:bio|link|profile)\b|\blink\s+in\s+bio\b/i;

/**
 * Minimum evidence for a text-led source: meaningful ingredient / quantity /
 * instruction signal — more than a generic food description (§10).
 * Deterministic on purpose; no model in the loop.
 */
export function hasRecipeSignal(text: string): boolean {
  const t = text?.trim() ?? "";
  if (t.length < 40) return false;
  const measurements = t.match(MEASUREMENT_UNITS)?.length ?? 0;
  const verbs = t.match(INSTRUCTION_VERBS)?.length ?? 0;
  const header = INGREDIENT_HEADER.test(t);
  // Quantity signal plus either instructions or explicit section headers,
  // or a strong showing of both other signals.
  if (measurements >= 2 && (verbs >= 1 || header)) return true;
  if (measurements >= 1 && verbs >= 2 && header) return true;
  // Explicit recipe structure with a real method is sufficient WITHOUT weighed
  // measurements: count-based and to-taste recipes ("2 eggs", "1 onion", "salt
  // to taste") are legitimate and common, and the unit whitelist never counts
  // them. The explicit Ingredients/Method headers are what keep this from
  // accepting a generic food description.
  if (header && verbs >= 2) return true;
  return false;
}

export function decideEvidence(evidence: SourceEvidence): EvidenceDecision {
  const warnings = new Set(evidence.evidenceWarnings);
  const caption = evidence.caption ?? "";

  if (warnings.has("login_wall_detected")) {
    return { sufficient: false, reason: "login_wall", nextAction: "try_next_resolver" };
  }
  if (warnings.has("private_content") || warnings.has("deleted_content") || warnings.has("restricted_content")) {
    // Content failures — no rung can fix these, but the engine owns chain
    // position; it converts try_next_resolver to request_user_input when the
    // failure is terminal for every remaining rung.
    return { sufficient: false, reason: "unavailable", nextAction: "try_next_resolver" };
  }
  if (evidence.retrievalStatus === "unavailable" || evidence.retrievalStatus === "unsupported") {
    return { sufficient: false, reason: "unavailable", nextAction: "try_next_resolver" };
  }

  // A "recipe in bio" caption is never sufficient, whatever else it says (AC4).
  if (RECIPE_IN_BIO.test(caption)) {
    return { sufficient: false, reason: "insufficient_caption", nextAction: "try_next_resolver" };
  }

  const truncated = warnings.has("caption_may_be_truncated");
  const captionSufficient = !truncated && hasRecipeSignal(caption);

  // Carousel: complete caption OR all required slides (§9.1). Slides are not
  // retrievable this story (image flow is import-capture-review-v2), so the
  // caption carries the burden; missing slides are partial evidence.
  if (evidence.postType === "carousel" || evidence.sourceType === "instagram_carousel") {
    if (captionSufficient) {
      return { sufficient: true, reason: "complete_caption", nextAction: "extract_recipe" };
    }
    if (warnings.has("carousel_items_missing") || evidence.retrievalStatus === "partial") {
      return { sufficient: false, reason: "missing_carousel_items", nextAction: "try_next_resolver" };
    }
    return { sufficient: false, reason: "insufficient_caption", nextAction: "try_next_resolver" };
  }

  // Reel: caption alone only when it appears to contain the complete recipe;
  // otherwise a usable video would be needed, and video is unsupported (§0.2).
  if (evidence.postType === "reel" || evidence.sourceType === "instagram_reel") {
    if (captionSufficient) {
      return { sufficient: true, reason: "complete_caption", nextAction: "extract_recipe" };
    }
    return {
      sufficient: false,
      reason: warnings.has("video_unavailable") ? "missing_video" : "insufficient_caption",
      nextAction: "try_next_resolver",
    };
  }

  // Text-led sources (pasted text, website text, caption-led posts).
  if (captionSufficient) {
    return { sufficient: true, reason: "complete_caption", nextAction: "extract_recipe" };
  }
  if (warnings.has("unknown_completeness")) {
    return { sufficient: false, reason: "unknown_completeness", nextAction: "try_next_resolver" };
  }
  return { sufficient: false, reason: "insufficient_caption", nextAction: "try_next_resolver" };
}
