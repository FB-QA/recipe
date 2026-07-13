-- ============================================================
-- 0008 — enforce the grocery dedup invariant at the database
-- The app-level "already on list" check can be raced by two tabs. A unique
-- index makes the database the source of truth. Existing duplicate rows are
-- collapsed first (a unique index can't be built over duplicates).
--
-- Recipes source_url uniqueness is handled in createRecipe (a recheck before
-- insert) rather than a unique index, to avoid destructively deleting a user's
-- duplicate recipes during migration.
-- ============================================================

-- Collapse existing duplicates, keeping one row per (list, source ingredient).
delete from public.grocery_items gi
using (
  select list_id, source_ingredient_id, min(ctid) as keep
  from public.grocery_items
  where source_ingredient_id is not null
  group by list_id, source_ingredient_id
  having count(*) > 1
) d
where gi.list_id = d.list_id
  and gi.source_ingredient_id = d.source_ingredient_id
  and gi.ctid <> d.keep;

-- Manual items keep source_ingredient_id null; Postgres treats nulls as
-- distinct, so they never collide. Replaces the earlier non-unique index.
drop index if exists public.grocery_items_source_ingredient_idx;
create unique index grocery_items_list_ingredient_key
  on public.grocery_items (list_id, source_ingredient_id);
