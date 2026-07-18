-- ============================================================
-- 0008 — nutrition on recipes
-- Recipes gain the common macros as free text (matching servings/prep_time/
-- cook_time), stored exactly as the source stated them ("480 kcal", "45g").
-- Additive; no backfill.
-- ============================================================
alter table public.recipes
  add column calories             text,
  add column protein              text,
  add column carbs                text,
  add column fat                  text,
  add column nutrition_per_serving boolean;
