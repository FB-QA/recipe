import { beforeEach, describe, expect, it, vi } from "vitest";

// A query error must NEVER be swallowed into an empty list/zero count: doing so
// renders a transient auth/DB blip as a legitimate-looking empty shelf, which then
// caches on the client as a successful "you have no recipes" state. Throwing routes
// it to the error boundary (a "Try again" that re-renders fresh) instead.

const { signStoragePaths } = vi.hoisted(() => ({
  signStoragePaths: vi.fn(async () => ({}) as Record<string, string>),
}));
vi.mock("@/lib/supabase/storage", () => ({ signStoragePaths }));

let queryResult: { data: unknown; error: unknown };
let countResult: { count: number | null; error?: unknown };

// A minimal chainable stand-in for the Supabase query builder. The list query is
// awaited after .order(); the count query is awaited after .select().
function makeClient() {
  const listBuilder: Record<string, unknown> = {};
  for (const m of ["select", "order", "eq", "ilike"]) {
    listBuilder[m] = vi.fn(() => listBuilder);
  }
  // Awaiting the builder resolves to the list query result.
  (listBuilder as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(queryResult);

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

import { listRecipes, countRecipes } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
  queryResult = { data: [], error: null };
  countResult = { count: 0 };
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

  it("maps rows on success", async () => {
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
          cover_image_path: null,
          recipe_ingredients: [{ count: 22 }],
        },
      ],
      error: null,
    };
    const rows = await listRecipes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "r1", title: "Jambalaya", ingredientCount: 22 });
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
