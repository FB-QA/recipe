-- ============================================================
-- 0002 — recipes + ordered children (ingredients, steps, tips)
--
-- V1 simplifications (deliberate, per "don't overengineer"):
--   * favourites  -> a boolean on recipes (each recipe has one owner)
--   * categories  -> a tags text[] on recipes (no join table in V1)
--   * times/servings are free text — captions rarely give clean numbers.
-- ============================================================

create extension if not exists pg_trgm;

create type public.source_type as enum ('manual', 'instagram', 'website');

-- ------------------------------------------------------------
-- recipes
-- ------------------------------------------------------------
create table public.recipes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  description      text,
  cover_image_path text,
  prep_time        text,
  cook_time        text,
  servings         text,
  source_url       text,
  source_type      public.source_type not null default 'manual',
  tags             text[] not null default '{}',
  is_favourite     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index recipes_user_created_idx on public.recipes (user_id, created_at desc);
create index recipes_user_fav_idx on public.recipes (user_id) where is_favourite;
create index recipes_title_trgm_idx on public.recipes using gin (title gin_trgm_ops);
create index recipes_tags_idx on public.recipes using gin (tags);

alter table public.recipes enable row level security;
alter table public.recipes force row level security;
grant select, insert, update, delete on public.recipes to authenticated;

create policy "recipes: owner select" on public.recipes
  for select using ((select auth.uid()) = user_id);
create policy "recipes: owner insert" on public.recipes
  for insert with check ((select auth.uid()) = user_id);
create policy "recipes: owner update" on public.recipes
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recipes: owner delete" on public.recipes
  for delete using ((select auth.uid()) = user_id);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Single-sourced ownership check for child tables. SECURITY DEFINER
-- so the EXISTS lookup isn't itself blocked by RLS.
-- ------------------------------------------------------------
create or replace function public.owns_recipe(rid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.recipes
    where id = rid and user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- recipe_ingredients
-- ------------------------------------------------------------
create table public.recipe_ingredients (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  display_text text not null,
  quantity     text,
  unit         text,
  name         text,
  sort_order   int not null default 0
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort_order);

alter table public.recipe_ingredients enable row level security;
alter table public.recipe_ingredients force row level security;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;

create policy "ingredients: owner all" on public.recipe_ingredients
  for all using (public.owns_recipe(recipe_id)) with check (public.owns_recipe(recipe_id));

-- ------------------------------------------------------------
-- recipe_steps
-- ------------------------------------------------------------
create table public.recipe_steps (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  instruction text not null,
  image_path  text,
  sort_order  int not null default 0
);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, sort_order);

alter table public.recipe_steps enable row level security;
alter table public.recipe_steps force row level security;
grant select, insert, update, delete on public.recipe_steps to authenticated;

create policy "steps: owner all" on public.recipe_steps
  for all using (public.owns_recipe(recipe_id)) with check (public.owns_recipe(recipe_id));

-- ------------------------------------------------------------
-- recipe_tips
-- ------------------------------------------------------------
create table public.recipe_tips (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  text       text not null,
  sort_order int not null default 0
);
create index recipe_tips_recipe_idx on public.recipe_tips (recipe_id, sort_order);

alter table public.recipe_tips enable row level security;
alter table public.recipe_tips force row level security;
grant select, insert, update, delete on public.recipe_tips to authenticated;

create policy "tips: owner all" on public.recipe_tips
  for all using (public.owns_recipe(recipe_id)) with check (public.owns_recipe(recipe_id));
