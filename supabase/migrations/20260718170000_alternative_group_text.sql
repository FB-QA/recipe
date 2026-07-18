-- ============================================================
-- 0010 — recipe_ingredients.alternative_group: uuid → text
-- The extracted-recipe schema (§18) models alternativeGroupId as an arbitrary
-- string identifier (e.g. "alt-1"), and the save path posts that value straight
-- into recipe_ingredients.alternative_group. The column was typed `uuid` (0001's
-- import-engine migration), so any recipe with ingredient alternatives failed to
-- insert with an invalid-uuid error, leaving the user unable to save it.
-- alternative_group is a within-recipe grouping tag, never a foreign key, so text
-- is the correct type. uuid → text is a safe widening cast (no data loss).
-- ============================================================
alter table public.recipe_ingredients
  alter column alternative_group type text using alternative_group::text;
