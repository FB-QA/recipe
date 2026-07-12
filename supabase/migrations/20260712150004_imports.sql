-- ============================================================
-- 0004 — recipe_imports
-- Tracks every import attempt: the method used, estimated cost, and the
-- extracted payload (so re-importing the same URL is free — cache + no
-- repeated processing). Also the basis for per-user rate limits.
-- ============================================================

create type public.import_status as enum ('success', 'no_recipe', 'failed');

create table public.recipe_imports (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_url            text not null,
  source_type           public.source_type not null,
  status                public.import_status not null,
  method                text,               -- 'jsonld' | 'ai_text' | 'apify+ai' | 'cache'
  estimated_cost_cents  numeric(8, 4) not null default 0,
  extracted             jsonb,              -- cached ExtractedRecipe when status = success
  media_url             text,              -- Reel video / source media, for the fallback state
  error                 text,
  recipe_id             uuid references public.recipes (id) on delete set null,
  created_at            timestamptz not null default now()
);

create index recipe_imports_user_created_idx on public.recipe_imports (user_id, created_at desc);
create index recipe_imports_user_url_idx on public.recipe_imports (user_id, source_url);

alter table public.recipe_imports enable row level security;
alter table public.recipe_imports force row level security;
grant select, insert, update, delete on public.recipe_imports to authenticated;

create policy "imports: owner select" on public.recipe_imports
  for select using ((select auth.uid()) = user_id);
create policy "imports: owner insert" on public.recipe_imports
  for insert with check ((select auth.uid()) = user_id);
create policy "imports: owner update" on public.recipe_imports
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "imports: owner delete" on public.recipe_imports
  for delete using ((select auth.uid()) = user_id);

-- Count a user's imports since a cutoff — used to enforce the daily cap
-- without leaking other users' rows. SECURITY DEFINER + explicit user filter.
create or replace function public.imports_since(cutoff timestamptz)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int from public.recipe_imports
  where user_id = auth.uid() and created_at >= cutoff;
$$;
