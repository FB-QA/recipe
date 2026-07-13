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

-- ------------------------------------------------------------
-- Backfill existing installs onto the one-list-per-recipe model.
-- The old model piled every recipe's items into a single list; here each
-- recipe that already has items gets its own bound list, and its items move
-- onto it. Untagged (manually typed) items stay on their original list.
-- ------------------------------------------------------------
do $$
declare
  g record;
  bound_id uuid;
  candidate uuid;
begin
  -- Owner-scoped join: only migrate items whose recipe belongs to the list's
  -- owner, so a malformed cross-owner tag can never disclose another user's
  -- recipe title into this user's list name.
  for g in
    select distinct gl.user_id, gi.source_recipe_id as recipe_id
    from public.grocery_items gi
    join public.grocery_lists gl on gl.id = gi.list_id
    join public.recipes r on r.id = gi.source_recipe_id and r.user_id = gl.user_id
  loop
    select id into bound_id
      from public.grocery_lists
      where user_id = g.user_id and source_recipe_id = g.recipe_id
      limit 1;

    if bound_id is null then
      -- Prefer binding an existing unbound list whose tagged items are all this
      -- recipe (e.g. the old catch-all), rather than inserting a duplicate.
      select gl.id into candidate
        from public.grocery_lists gl
        where gl.user_id = g.user_id
          and gl.source_recipe_id is null
          and exists (
            select 1 from public.grocery_items gi
            where gi.list_id = gl.id and gi.source_recipe_id = g.recipe_id
          )
          -- All items must be this recipe's: no other recipe's tagged items and
          -- no manual (null-sourced) items, or binding would strand them under
          -- the recipe tab. Otherwise a new list is created and only tagged rows
          -- are moved.
          and not exists (
            select 1 from public.grocery_items gi
            where gi.list_id = gl.id
              and (gi.source_recipe_id is null or gi.source_recipe_id <> g.recipe_id)
          )
        order by (
          select count(*) from public.grocery_items gi
          where gi.list_id = gl.id and gi.source_recipe_id = g.recipe_id
        ) desc
        limit 1;

      if candidate is not null then
        update public.grocery_lists
          set source_recipe_id = g.recipe_id,
              name = left((select title from public.recipes where id = g.recipe_id and user_id = g.user_id), 80)
          where id = candidate;
        bound_id := candidate;
        candidate := null;
      else
        insert into public.grocery_lists (user_id, name, source_recipe_id)
        values (
          g.user_id,
          left((select title from public.recipes where id = g.recipe_id and user_id = g.user_id), 80),
          g.recipe_id
        )
        returning id into bound_id;
      end if;
    end if;

    update public.grocery_items
      set list_id = bound_id
      where source_recipe_id = g.recipe_id
        and list_id in (select id from public.grocery_lists where user_id = g.user_id);
  end loop;
end $$;

-- Retire the now-drained "This Week" catch-all lists (empty + unbound only).
-- User-named manual lists are left untouched, even if empty.
delete from public.grocery_lists gl
  where gl.source_recipe_id is null
    and gl.name = 'This Week'
    and not exists (select 1 from public.grocery_items gi where gi.list_id = gl.id);
