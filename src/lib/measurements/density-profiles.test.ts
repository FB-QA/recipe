import { describe, it, expect } from "vitest";
import {
  DENSITY_PROFILES,
  findDensityProfile,
  gramsPerMl,
  densityGramsPerMl,
  normalizeIngredientName,
  type IngredientDensityProfile,
} from "./density-profiles";
import { regionalMl } from "./regional-profiles";

describe("density corpus — verify (contract)", () => {
  it("resolves a canonical name to its profile", () => {
    expect(findDensityProfile("all-purpose flour")?.id).toBe("all-purpose-flour");
  });

  it("resolves a curated regional alias (IE 'plain flour')", () => {
    expect(findDensityProfile("plain flour")?.id).toBe("all-purpose-flour");
    expect(findDensityProfile("bicarbonate of soda")?.id).toBe("baking-soda");
    expect(findDensityProfile("icing sugar")?.id).toBe("icing-sugar");
    expect(findDensityProfile("cornflour")?.id).toBe("cornstarch");
  });

  it("normalises case, punctuation, whitespace and a safe trailing plural", () => {
    expect(findDensityProfile("  PLAIN  Flour. ")?.id).toBe("all-purpose-flour");
    expect(findDensityProfile("confectioners' sugar")?.id).toBe("icing-sugar");
    expect(findDensityProfile("raisin")?.id).toBe("raisins"); // singular query, plural canonical
    expect(findDensityProfile("chocolate chip")?.id).toBe("chocolate-chips");
  });

  it("derives g/ml from the published reference (via shared regional ml)", () => {
    const flour = findDensityProfile("plain flour")!;
    // 120 g / (1 × 236.5882365 ml US cup) = 0.5072 g/ml
    expect(gramsPerMl(flour)).toBeCloseTo(0.5072, 3);
  });

  it("delivers the headline case: 375 ml plain flour ≈ 190 g (not water's 375 g)", () => {
    const gml = densityGramsPerMl("plain flour")!;
    expect(375 * gml).toBeCloseTo(190, 0);
  });

  it("derives a reference published in a fraction of a cup / a spoon", () => {
    // Butter 113 g per 1/2 US cup → 0.955 g/ml.
    expect(gramsPerMl(findDensityProfile("butter")!)).toBeCloseTo(0.955, 2);
    // Baking soda 3 g per 1/2 tsp → 6 g/tsp.
    expect(gramsPerMl(findDensityProfile("baking soda")!) * regionalMl("tsp", "us")!).toBeCloseTo(6, 1);
  });

  it("derives a reference published in region-neutral millilitres (no throw)", () => {
    const p: IngredientDensityProfile = {
      id: "t", canonicalName: "t", aliases: [],
      referenceQuantity: 100, referenceUnit: "ml", equivalentGrams: 80,
      source: { name: "t", reference: "t" }, sourceQuality: "reviewed",
    };
    expect(gramsPerMl(p)).toBeCloseTo(0.8, 5); // 80 g / 100 ml
  });

  it("uses the GENERIC rolled-oats weight (89 g/cup), not the branded 113 g", () => {
    const oats = findDensityProfile("rolled oats")!;
    expect(oats.equivalentGrams).toBe(89);
    expect(findDensityProfile("quick oats")?.id).toBe("rolled-oats"); // KA groups these
  });

  it("keeps the flours DISTINCT — bare 'flour' does not resolve", () => {
    expect(findDensityProfile("flour")).toBeNull();
    // and the distinct flours differ in density
    const plain = gramsPerMl(findDensityProfile("plain flour")!);
    const wholemeal = gramsPerMl(findDensityProfile("wholemeal flour")!);
    const almond = gramsPerMl(findDensityProfile("almond flour")!);
    expect(plain).not.toBeCloseTo(wholemeal, 2);
    expect(plain).not.toBeCloseTo(almond, 2);
  });

  it("exposes the assumed preparation where it matters", () => {
    expect(findDensityProfile("brown sugar")?.assumedPreparationLabel).toBe("packed");
    expect(findDensityProfile("brown sugar")?.preparationState).toBe("packed");
  });

  it("converts a US cup and a metric cup of one profile to DIFFERENT grams", () => {
    // Same physical density, different cup sizes → the derivation is region-honest.
    const gml = densityGramsPerMl("granulated sugar")!;
    const us = regionalMl("cup", "us")! * gml;
    const metric = regionalMl("cup", "metric")! * gml;
    expect(us).toBeCloseTo(198, 0);
    expect(metric).toBeGreaterThan(us + 5); // 250 ml > 236.6 ml
  });
});

describe("density corpus — falsify (adversary + data integrity)", () => {
  it("has unique profile IDs", () => {
    const ids = DENSITY_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no alias colliding with another profile (no name maps to two)", () => {
    const seen = new Map<string, string>();
    for (const p of DENSITY_PROFILES) {
      for (const name of [p.canonicalName, ...p.aliases]) {
        const key = normalizeIngredientName(name);
        const prior = seen.get(key);
        expect(prior, `"${name}" (${key}) maps to both ${prior} and ${p.id}`).toBeUndefined();
        seen.set(key, p.id);
      }
    }
  });

  it("has valid quantities and grams on every profile", () => {
    for (const p of DENSITY_PROFILES) {
      expect(p.referenceQuantity, p.id).toBeGreaterThan(0);
      expect(p.equivalentGrams, p.id).toBeGreaterThan(0);
      expect(Number.isFinite(gramsPerMl(p)), p.id).toBe(true);
      expect(gramsPerMl(p), p.id).toBeGreaterThan(0);
    }
  });

  it("has complete source metadata on every profile", () => {
    for (const p of DENSITY_PROFILES) {
      expect(p.source?.name, p.id).toBeTruthy();
      expect(p.source?.reference, p.id).toBeTruthy();
      expect(["authoritative", "reviewed"]).toContain(p.sourceQuality);
    }
  });

  it("uses only reference units the regional table can resolve", () => {
    for (const p of DENSITY_PROFILES) {
      expect(regionalMl(p.referenceUnit, p.referenceRegion ?? "us"), `${p.id} ${p.referenceUnit}`).toBeGreaterThan(0);
    }
  });

  it("does NOT fuzzy/substring match", () => {
    expect(findDensityProfile("strong wholemeal bread flour")).toBeNull();
    expect(findDensityProfile("flourless")).toBeNull();
    expect(findDensityProfile("salted caramel")).toBeNull(); // contains "salt"? no — must not match table salt
    expect(findDensityProfile("brown sugar syrup")).toBeNull();
  });

  it("returns null for an unknown ingredient (never guesses)", () => {
    expect(findDensityProfile("chicken breast")).toBeNull();
    expect(findDensityProfile("")).toBeNull();
    expect(findDensityProfile(null)).toBeNull();
    expect(findDensityProfile(undefined)).toBeNull();
    expect(densityGramsPerMl("chicken breast")).toBeNull();
  });

  it("does NOT alias ambiguous names that differ in density", () => {
    // US two-word "corn flour" (fine cornmeal) must not hit cornstarch.
    expect(findDensityProfile("corn flour")).toBeNull();
    // kosher/flaky salt differ from table salt — not aliased.
    expect(findDensityProfile("kosher salt")).toBeNull();
    expect(findDensityProfile("flaky sea salt")).toBeNull();
    // bare "oats" is ambiguous (steel-cut is denser) — not aliased.
    expect(findDensityProfile("oats")).toBeNull();
    expect(findDensityProfile("steel-cut oats")).toBeNull();
    expect(findDensityProfile("pinhead oatmeal")).toBeNull();
  });
});
