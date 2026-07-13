-- ============================================================
-- 0006 — one grocery list per recipe
-- Adding a recipe's ingredients now targets a list bound to that recipe,
-- created on first add and named after it. Manual lists keep
-- source_recipe_id null. Deleting a recipe demotes its list to a plain
-- manual list (set null) rather than destroying already-shopped items.
-- ============================================================

alter table public.grocery_lists
  add column source_recipe_id uuid references public.recipes (id) on delete set null;

-- One recipe-bound list per user; manual lists (null) stay unconstrained.
create unique index grocery_lists_user_recipe_idx
  on public.grocery_lists (user_id, source_recipe_id)
  where source_recipe_id is not null;
