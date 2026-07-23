import { beforeEach, describe, expect, it, vi } from "vitest";

// A query error must NEVER be swallowed into an empty list/zero count: doing so
// renders a transient auth/DB blip as a legitimate-looking empty shelf, which then
// caches on the client as a successful "you have no recipes" state. Throwing routes
// it to the error boundary (a "Try again" that re-renders fresh) instead.

const { signStoragePaths } = vi.hoisted(() => ({
  signStoragePaths: vi.fn(async () => ({}) as Record<string, string>),
}));
vi.mock("@/lib/supabase/storage", () => ({ signStoragePaths, SHELF_SIGNED_TTL: 43200 }));

let queryResult: { data: unknown; error: unknown };
let countResult: { count: number | null; error?: unknown };
let singleResult: { data: unknown; error: unknown };

// A minimal chainable stand-in for the Supabase query builder. The list query is
// awaited after .order(); the count query is awaited after .select().
function makeClient() {
  const listBuilder: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "ilike"]) {
    listBuilder[m] = vi.fn(() => listBuilder);
  }
  // Awaiting the builder resolves to the list query result (listRecipes ends on
  // .order()). getRecipe ends on .maybeSingle(), which resolves to singleResult.
  (listBuilder as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(queryResult);
  listBuilder.maybeSingle = vi.fn(() => Promise.resolve(singleResult));

  return {
    from: vi.fn(() => ({
      select: vi.fn((_cols: string, opts?: { head?: boolean }) => {
        // The count query passes { head: true } and is awaited straight off select().
        if (opts?.head) return Promise.resolve(countResult);
        return listBuilder;
      }),
    })),
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => makeClient()) }));

import { listRecipes, countRecipes, getRecipe } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = { data: [], error: null };
  countResult = { count: 0 };
  singleResult = { data: null, error: null };
  signStoragePaths.mockResolvedValue({});
});

describe("listRecipes — a query error surfaces, an empty result does not", () => {
  it("throws when the query errors (never a silent empty list)", async () => {
    queryResult = { data: null, error: { message: "JWT expired" } };
    await expect(listRecipes()).rejects.toThrow(/listRecipes/i);
  });

  it("returns an empty array for a genuinely empty shelf (no error)", async () => {
    queryResult = { data: [], error: null };
    await expect(listRecipes()).resolves.toEqual([]);
  });

  it("maps rows on success, resolving the thumb URL for the shelf card", async () => {
    signStoragePaths.mockResolvedValue({
      "u/r1/cover.webp": "https://signed/cover",
      "u/r1/thumb.webp": "https://signed/thumb",
    });
    queryResult = {
      data: [
        {
          id: "r1",
          title: "Jambalaya",
          servings: "4",
          source_type: "url",
          source_handle: "recipetineats",
          is_favourite: false,
          tags: [],
          cover_image_path: "u/r1/cover.webp",
          thumb_image_path: "u/r1/thumb.webp",
          recipe_ingredients: [{ count: 22 }],
        },
      ],
      error: null,
    };
    const rows = await listRecipes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "r1",
      title: "Jambalaya",
      ingredientCount: 22,
      coverUrl: "https://signed/cover",
      thumbUrl: "https://signed/thumb",
    });
  });

  it("signs shelf covers with the long shelf TTL, not the 1h default (lazy cards outlive it)", async () => {
    queryResult = {
      data: [
        {
          id: "r1",
          title: "Jambalaya",
          servings: "4",
          source_type: "url",
          source_handle: null,
          is_favourite: false,
          tags: [],
          cover_image_path: "u/r1/cover.webp",
          thumb_image_path: "u/r1/thumb.webp",
          recipe_ingredients: [{ count: 3 }],
        },
      ],
      error: null,
    };
    await listRecipes();
    // Positional TTL arg — pin it so a future refactor that drops or reorders it can't
    // silently regress lazy-loaded thumbnails back to 1h expiry.
    expect(signStoragePaths).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(["u/r1/cover.webp", "u/r1/thumb.webp"]),
      43200,
    );
  });
});

describe("countRecipes — a count error surfaces, it never silently reports zero", () => {
  it("throws when the count query errors", async () => {
    countResult = { count: null, error: { message: "JWT expired" } };
    await expect(countRecipes()).rejects.toThrow(/countRecipes/i);
  });

  it("returns the count on success", async () => {
    countResult = { count: 5 };
    await expect(countRecipes()).resolves.toBe(5);
  });
});

describe("getRecipe — a query error surfaces, a missing recipe is a clean null", () => {
  it("throws when the query errors (not a silent 404)", async () => {
    singleResult = { data: null, error: { message: "JWT expired" } };
    await expect(getRecipe("r1")).rejects.toThrow(/getRecipe/i);
  });

  it("returns null when the recipe genuinely does not exist (no error, no data)", async () => {
    singleResult = { data: null, error: null };
    await expect(getRecipe("missing")).resolves.toBeNull();
  });

  it("returns the recipe on success", async () => {
    singleResult = {
      data: {
        id: "r1",
        title: "Jambalaya",
        cover_image_path: null,
        recipe_ingredient_groups: [],
        recipe_ingredients: [],
        recipe_steps: [],
        recipe_tips: [],
      },
      error: null,
    };
    const r = await getRecipe("r1");
    expect(r).toMatchObject({ id: "r1", title: "Jambalaya" });
  });
});
