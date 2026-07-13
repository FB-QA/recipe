import type { ExtractedRecipe } from "./types";

/** "PT1H30M" / "PT20M" → "1 hr 30 min". Returns null for unparseable input. */
export function humaniseDuration(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m || (!m[1] && !m[2])) return null;
  const parts: string[] = [];
  if (m[1]) parts.push(`${m[1]} hr`);
  if (m[2]) parts.push(`${m[2]} min`);
  return parts.join(" ");
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = firstString(item);
      if (s) return s;
    }
  }
  if (v && typeof v === "object" && "url" in v) return firstString((v as { url: unknown }).url);
  return null;
}

type JsonLdNode = Record<string, unknown>;

function findRecipeNode(json: unknown): JsonLdNode | null {
  const nodes: unknown[] = Array.isArray(json) ? json : [json];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const obj = node as JsonLdNode;
    if (obj["@graph"]) {
      const nested = findRecipeNode(obj["@graph"]);
      if (nested) return nested;
    }
    const type = obj["@type"];
    const types = asArray(type).map((t) => String(t).toLowerCase());
    if (types.includes("recipe")) return obj;
  }
  return null;
}

function mapInstructions(raw: unknown): string[] {
  const out: string[] = [];
  for (const item of asArray(raw)) {
    if (typeof item === "string") {
      // Some sites cram all steps into one string with newlines.
      item
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => out.push(s));
    } else if (item && typeof item === "object") {
      const obj = item as JsonLdNode;
      if (obj["@type"] && String(obj["@type"]).toLowerCase() === "howtosection") {
        mapInstructions(obj.itemListElement).forEach((s) => out.push(s));
      } else {
        const text = firstString(obj.text) ?? firstString(obj.name);
        if (text) out.push(text);
      }
    }
  }
  return out;
}

/** Parse schema.org/Recipe JSON-LD out of a page's HTML. No AI, no cost. */
export function extractRecipeFromHtml(html: string): ExtractedRecipe | null {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    let json: unknown;
    try {
      json = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(json);
    if (!node) continue;

    const title = firstString(node.name);
    const ingredients = asArray(node.recipeIngredient)
      .map((i) => (typeof i === "string" ? i.trim() : ""))
      .filter(Boolean);
    const steps = mapInstructions(node.recipeInstructions);

    if (!title || ingredients.length === 0 || steps.length === 0) continue;

    return {
      title,
      description: firstString(node.description),
      servings: firstString(node.recipeYield),
      prep_time: humaniseDuration(firstString(node.prepTime)),
      cook_time: humaniseDuration(firstString(node.cookTime)),
      ingredients: ingredients.map((display_text) => ({ display_text })),
      steps,
      tips: [],
      imageUrl: firstString(node.image),
      sourceHandle: null,
    };
  }
  return null;
}
