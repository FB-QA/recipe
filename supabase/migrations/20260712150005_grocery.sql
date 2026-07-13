-- ============================================================
-- 0005 — grocery lists + items
-- V1 keeps merging simple: adding a recipe's ingredients appends line items;
-- no unit conversion or normalisation engine.
-- ============================================================

create table public.grocery_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grocery_lists_user_idx on public.grocery_lists (user_id, created_at);

alter table public.grocery_lists enable row level security;
alter table public.grocery_lists force row level security;
grant select, insert, update, delete on public.grocery_lists to authenticated;

create policy "lists: owner all" on public.grocery_lists
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger grocery_lists_set_updated_at
  before update on public.grocery_lists
  for each row execute function public.set_updated_at();

create or replace function public.owns_list(lid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.grocery_lists where id = lid and user_id = auth.uid()
  );
$$;

create table public.grocery_items (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null references public.grocery_lists (id) on delete cascade,
  display_text     text not null,
  quantity         text,
  is_completed     boolean not null default false,
  sort_order       int not null default 0,
  source_recipe_id uuid references public.recipes (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index grocery_items_list_idx on public.grocery_items (list_id, sort_order);
create index grocery_items_list_done_idx on public.grocery_items (list_id, is_completed);

alter table public.grocery_items enable row level security;
alter table public.grocery_items force row level security;
grant select, insert, update, delete on public.grocery_items to authenticated;

create policy "items: owner all" on public.grocery_items
  for all using (public.owns_list(list_id)) with check (public.owns_list(list_id));
