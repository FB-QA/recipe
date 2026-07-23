/**
 * Ingredient density corpus (Phase 3) — a small, curated, version-controlled set
 * of verified baking-staple densities that lets the converter turn a VOLUME of a
 * dry ingredient into a WEIGHT (cup flour → grams) and back. It fills the seam the
 * converter left at MISSING_INGREDIENT_PROFILE; outside this set, weight↔volume
 * stays "unavailable" — we never guess.
 *
 * Sourcing discipline (the whole value of this file):
 * - Each record stores the reference in the FORM IT WAS PUBLISHED (e.g. "1 cup =
 *   120 g"), not a bare g/ml — so a cooking-chart value is never dressed up as a
 *   lab-precise physical density. The engine derives g/ml from that reference via
 *   the same regional millilitre constants the rest of the library uses.
 * - `sourceQuality` records how good the citation is; it is SEPARATE from the
 *   conversion's confidence. Even an authoritative transcription yields a
 *   `medium` / approximate conversion — cup packing varies ±20% in a real kitchen.
 *
 * Matching is STRICT: normalised exact canonical name or a curated exact alias.
 * No fuzzy, substring, or inferred matching. A bare "flour" does NOT map to plain
 * flour — the flours are distinct profiles. No confident match → no conversion.
 *
 * Structured so it could later seed a DB table (Phase 6, if user-managed density
 * is ever needed); no migration or DB plumbing now.
 */

import { regionalMl } from "./regional-profiles";
import type { MeasurementRegion } from "./measurement-types";

export type DensitySourceQuality = "authoritative" | "reviewed";

/** A published volume→weight reference for one ingredient, plus its match keys. */
export interface IngredientDensityProfile {
  /** Stable slug — also the future DB primary key. */
  id: string;
  /** The canonical display/match name. */
  canonicalName: string;
  /** Curated exact aliases (regional names, common spellings). NEVER fuzzy. */
  aliases: string[];
  /** The preparation this density assumes, when it materially changes the weight. */
  preparationState?: string;
  /** Human-facing note for the assumed prep, surfaced in the conversion explanation. */
  assumedPreparationLabel?: string;
  /** The reference AS PUBLISHED: referenceQuantity × referenceUnit = equivalentGrams. */
  referenceQuantity: number;
  referenceUnit: "tsp" | "tbsp" | "cup" | "ml";
  /** Region of the published reference unit (a US-cup chart is "us"). Defaults to "us". */
  referenceRegion?: MeasurementRegion;
  equivalentGrams: number;
  source: { name: string; reference: string };
  sourceQuality: DensitySourceQuality;
}

const KING_ARTHUR = {
  name: "King Arthur Baking Company",
  reference: "Ingredient Weight Chart — kingarthurbaking.com/learn/ingredient-weight-chart",
} as const;

// Values transcribed from the King Arthur Ingredient Weight Chart (US customary
// cups/tbsp/tsp), except caster sugar (reviewed source). The flours are kept as
// DISTINCT profiles — plain, bread, self-raising, wholemeal, cake and almond flour
// have different densities and must never collapse to a bare "flour".
export const DENSITY_PROFILES: IngredientDensityProfile[] = [
  // ── Flours ──
  {
    id: "all-purpose-flour",
    canonicalName: "all-purpose flour",
    aliases: ["all purpose flour", "plain flour"],
    assumedPreparationLabel: "spooned & levelled",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 120,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "bread-flour",
    canonicalName: "bread flour",
    aliases: ["strong flour", "strong white flour", "strong white bread flour"],
    assumedPreparationLabel: "spooned & levelled",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 120,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "self-raising-flour",
    canonicalName: "self-raising flour",
    aliases: ["self raising flour", "self-rising flour", "self rising flour"],
    assumedPreparationLabel: "spooned & levelled",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 113,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "wholemeal-flour",
    canonicalName: "wholemeal flour",
    aliases: ["whole wheat flour", "wholewheat flour", "wholemeal wheat flour"],
    assumedPreparationLabel: "spooned & levelled",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 113,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "cake-flour",
    canonicalName: "cake flour",
    aliases: [],
    assumedPreparationLabel: "spooned & levelled",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 120,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "almond-flour",
    canonicalName: "almond flour",
    aliases: ["ground almonds", "almond meal"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 96,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  // ── Sugars ──
  {
    id: "granulated-sugar",
    canonicalName: "granulated sugar",
    aliases: ["white sugar", "white granulated sugar"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 198,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "caster-sugar",
    canonicalName: "caster sugar",
    aliases: ["castor sugar", "superfine sugar"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 200,
    source: { name: "Cooking Converter", reference: "cookingconverter.com/measurements/caster-sugar (reviewed)" },
    sourceQuality: "reviewed",
  },
  {
    id: "brown-sugar",
    canonicalName: "brown sugar",
    aliases: ["light brown sugar", "dark brown sugar", "soft brown sugar", "packed brown sugar"],
    preparationState: "packed",
    assumedPreparationLabel: "packed",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 213,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "icing-sugar",
    canonicalName: "icing sugar",
    // The possessive variants ("confectioners sugar", "confectioner's sugar") all
    // normalise to the same key, so one form covers them.
    aliases: ["confectioners' sugar", "powdered sugar"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 113,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  // ── Fats ──
  {
    id: "butter",
    canonicalName: "butter",
    aliases: ["unsalted butter", "salted butter"],
    referenceQuantity: 0.5, referenceUnit: "cup", equivalentGrams: 113,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  // ── Dry baking staples ──
  {
    id: "cocoa-powder",
    canonicalName: "cocoa powder",
    aliases: ["cocoa", "unsweetened cocoa", "unsweetened cocoa powder", "dutch-process cocoa"],
    referenceQuantity: 0.5, referenceUnit: "cup", equivalentGrams: 42,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "rolled-oats",
    canonicalName: "rolled oats",
    // KA's GENERIC "old-fashioned or quick-cooking" oats are 89 g/cup — the 113 g
    // row is its branded thick-cut "Rolled" product, not the generic value. Only
    // preparation-named forms alias (old-fashioned/rolled/quick, all ~89 g/cup);
    // bare "oats" and steel-cut/pinhead oats are deliberately unaliased (steel-cut
    // is denser), so an ambiguous "oats" resolves to unavailable rather than guessed.
    aliases: ["old-fashioned oats", "old fashioned oats", "porridge oats", "quick oats", "quick-cooking oats"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 89,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "cornstarch",
    canonicalName: "cornstarch",
    // "cornflour" (one word) is the UK/IE name for cornstarch. "corn flour" (two
    // words, US) is a different product (fine cornmeal) — deliberately NOT aliased.
    aliases: ["corn starch", "cornflour"],
    referenceQuantity: 0.25, referenceUnit: "cup", equivalentGrams: 28,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "baking-powder",
    canonicalName: "baking powder",
    aliases: [],
    referenceQuantity: 1, referenceUnit: "tsp", equivalentGrams: 4,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "baking-soda",
    canonicalName: "baking soda",
    aliases: ["bicarbonate of soda", "bicarb soda", "sodium bicarbonate", "bread soda"],
    referenceQuantity: 0.5, referenceUnit: "tsp", equivalentGrams: 3,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "table-salt",
    canonicalName: "table salt",
    // "salt" defaults to TABLE salt (documented). Kosher/flaky/sea salt differ in
    // density and are deliberately NOT aliased here.
    aliases: ["salt", "fine salt", "fine sea salt"],
    assumedPreparationLabel: "fine table salt",
    referenceQuantity: 1, referenceUnit: "tbsp", equivalentGrams: 18,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "honey",
    canonicalName: "honey",
    aliases: [],
    referenceQuantity: 1, referenceUnit: "tbsp", equivalentGrams: 21,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "chocolate-chips",
    canonicalName: "chocolate chips",
    aliases: ["choc chips"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 170,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "raisins",
    canonicalName: "raisins",
    aliases: [],
    preparationState: "loose",
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 149,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "desiccated-coconut",
    canonicalName: "desiccated coconut",
    aliases: ["shredded coconut", "unsweetened shredded coconut", "dried coconut"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 53,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "breadcrumbs",
    canonicalName: "breadcrumbs",
    aliases: ["bread crumbs", "dried breadcrumbs", "dried bread crumbs"],
    assumedPreparationLabel: "dried",
    referenceQuantity: 0.25, referenceUnit: "cup", equivalentGrams: 28,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "cornmeal",
    canonicalName: "cornmeal",
    // "polenta" is a DIFFERENT grind (coarser, denser) — its own profile below.
    aliases: ["whole cornmeal"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 138,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "polenta",
    canonicalName: "polenta",
    aliases: ["coarse cornmeal"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 163,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
  {
    id: "semolina",
    canonicalName: "semolina",
    aliases: ["semolina flour"],
    referenceQuantity: 1, referenceUnit: "cup", equivalentGrams: 163,
    source: KING_ARTHUR, sourceQuality: "authoritative",
  },
];

/**
 * Normalise a name for matching: lowercase, strip punctuation, collapse
 * whitespace, and remove ONE trailing plural "s" (but not "ss", so "molasses"
 * survives). The query and every alias pass through the SAME normalisation, so
 * plural handling is symmetric.
 */
export function normalizeIngredientName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’.,]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?<!s)s$/, "");
}

// Build the lookup once: every normalised canonical name + alias → its profile.
const PROFILE_BY_NAME: Map<string, IngredientDensityProfile> = (() => {
  const map = new Map<string, IngredientDensityProfile>();
  for (const profile of DENSITY_PROFILES) {
    for (const name of [profile.canonicalName, ...profile.aliases]) {
      map.set(normalizeIngredientName(name), profile);
    }
  }
  return map;
})();

/** STRICT lookup: exact normalised canonical name or curated alias, else null. */
export function findDensityProfile(name: string | null | undefined): IngredientDensityProfile | null {
  if (!name) return null;
  return PROFILE_BY_NAME.get(normalizeIngredientName(name)) ?? null;
}

/**
 * The physical density (grams per millilitre) derived from a profile's published
 * reference, via the same regional millilitre constants the converter uses.
 */
export function gramsPerMl(profile: IngredientDensityProfile): number {
  // "ml" is region-neutral (1 ml = 1 ml); regionalMl only holds spoon/cup entries,
  // so a profile published as "100 ml = 80 g" is handled directly here.
  const ml = profile.referenceUnit === "ml" ? 1 : regionalMl(profile.referenceUnit, profile.referenceRegion ?? "us");
  if (ml == null) throw new Error(`No regional ml for ${profile.referenceUnit} (${profile.id})`);
  return profile.equivalentGrams / (profile.referenceQuantity * ml);
}

/** Resolve an ingredient name straight to its g/ml, or null when unknown. */
export function densityGramsPerMl(name: string | null | undefined): number | null {
  const profile = findDensityProfile(name);
  return profile ? gramsPerMl(profile) : null;
}
