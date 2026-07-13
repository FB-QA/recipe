-- ============================================================
-- 0007 — grocery item ingredient provenance
-- Track which recipe ingredient each grocery item came from, so re-adding a
-- recipe's ingredients skips the ones already on its list instead of
-- duplicating them. Manual items keep source_ingredient_id null.
-- ============================================================

alter table public.grocery_items
  add column source_ingredient_id uuid references public.recipe_ingredients (id) on delete set null;

create index grocery_items_source_ingredient_idx
  on public.grocery_items (list_id, source_ingredient_id)
  where source_ingredient_id is not null;
