import { describe, expect, it } from "vitest";
import { decideEvidence, hasRecipeSignal } from "./evidence";
import type { SourceEvidence } from "./schema";

const FULL_CAPTION = [
  "One-pan chicken orzo!",
  "Ingredients:",
  "500g chicken thighs",
  "1–2 tbsp olive oil",
  "250g orzo",
  "Method:",
  "1. Brown the chicken.",
  "2. Add the orzo and stock, simmer 12 minutes.",
].join("\n");

function evidence(overrides: Partial<SourceEvidence>): SourceEvidence {
  return {
    sourceType: "instagram_post",
    sourceUrl: "https://www.instagram.com/p/abc123/",
    retrievalStatus: "complete",
    resolverId: "instagram_direct",
    resolverAttemptId: "att-1",
    postType: "single_image",
    caption: FULL_CAPTION,
    title: null,
    creatorName: "cook",
    media: [],
    evidenceWarnings: [],
    contentFingerprint: null,
    retrievedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("hasRecipeSignal", () => {
  it("accepts text with ingredient/quantity/instruction signal", () => {
    expect(hasRecipeSignal(FULL_CAPTION)).toBe(true);
  });

  it("rejects a generic food description", () => {
    expect(hasRecipeSignal("The most delicious pasta I've ever had. So creamy!")).toBe(false);
  });

  it("rejects empty and null-ish text", () => {
    expect(hasRecipeSignal("")).toBe(false);
    expect(hasRecipeSignal("   ")).toBe(false);
  });

  it("accepts an explicit unmeasured recipe (count-based / to-taste)", () => {
    const unmeasured =
      "Ingredients: 2 eggs, 1 onion, salt to taste. Method: chop the onion, whisk the eggs, fry together.";
    expect(hasRecipeSignal(unmeasured)).toBe(true);
  });

  it("still rejects a food description that name-drops one section word", () => {
    expect(hasRecipeSignal("The best ingredients make the most delicious creamy pasta ever.")).toBe(false);
  });
});

describe("decideEvidence — §10 acceptance gate", () => {
  it("accepts a complete caption with recipe signal", () => {
    const d = decideEvidence(evidence({}));
    expect(d).toEqual({ sufficient: true, reason: "complete_caption", nextAction: "extract_recipe" });
  });

  it("never accepts a 'recipe in bio' caption (AC4)", () => {
    const d = decideEvidence(evidence({ caption: "So good! Full recipe in bio ⬆️" }));
    expect(d.sufficient).toBe(false);
    expect(d.reason).toBe("insufficient_caption");
    expect(d.nextAction).toBe("try_next_resolver");
  });

  it("never accepts a teaser Reel with no recipe text (AC4)", () => {
    const d = decideEvidence(
      evidence({ postType: "reel", caption: "Wait for it… 🤤", evidenceWarnings: ["video_unavailable"] }),
    );
    expect(d.sufficient).toBe(false);
    expect(d.nextAction).toBe("try_next_resolver");
  });

  it("routes a login wall to the next rung, never judging by status code", () => {
    const d = decideEvidence(
      evidence({ retrievalStatus: "unavailable", caption: null, evidenceWarnings: ["login_wall_detected"] }),
    );
    expect(d).toEqual({ sufficient: false, reason: "login_wall", nextAction: "try_next_resolver" });
  });

  it("treats a truncated caption as insufficient even when text looks recipe-ish", () => {
    const d = decideEvidence(
      evidence({
        caption: FULL_CAPTION.slice(0, 80) + "… more",
        evidenceWarnings: ["caption_may_be_truncated"],
      }),
    );
    expect(d.sufficient).toBe(false);
    expect(d.reason).toBe("insufficient_caption");
  });

  it("marks a carousel with missing slides partial → next rung, never silently accepted", () => {
    const d = decideEvidence(
      evidence({
        sourceType: "instagram_carousel",
        postType: "carousel",
        retrievalStatus: "partial",
        caption: "Recipe on the slides →",
        evidenceWarnings: ["carousel_items_missing"],
      }),
    );
    expect(d.sufficient).toBe(false);
    expect(d.reason).toBe("missing_carousel_items");
    expect(d.nextAction).toBe("try_next_resolver");
  });

  it("accepts a carousel whose caption alone carries the complete recipe", () => {
    const d = decideEvidence(
      evidence({ sourceType: "instagram_carousel", postType: "carousel", caption: FULL_CAPTION }),
    );
    expect(d.sufficient).toBe(true);
  });

  it("routes wholly unavailable evidence onward", () => {
    const d = decideEvidence(
      evidence({ retrievalStatus: "unavailable", caption: null, evidenceWarnings: [] }),
    );
    expect(d).toEqual({ sufficient: false, reason: "unavailable", nextAction: "try_next_resolver" });
  });
});
