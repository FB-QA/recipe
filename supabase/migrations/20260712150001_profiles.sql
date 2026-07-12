-- ============================================================
-- 0001 — profiles + shared helpers + RLS baseline
-- Every user-owned table in this app follows the pattern set here:
--   * a user_id column that defaults to auth.uid()
--   * RLS enabled, force-enabled, with owner-only policies
--   * an updated_at column kept fresh by a trigger
-- ============================================================

-- Reusable: keep updated_at honest on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- profiles: one row per auth user, created automatically on signup
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- Table-level grants are separate from RLS: the role needs privileges AND the
-- row must pass a policy. Tables created via raw SQL don't inherit Supabase's
-- default grants, so every table grants explicitly. (Insert is handled by the
-- SECURITY DEFINER signup trigger, so authenticated needs no insert here.)
grant select, update on public.profiles to authenticated;

create policy "profiles: owner can read own"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles: owner can update own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Provision a profile whenever a new auth user is created.
-- SECURITY DEFINER so it can insert past RLS during signup.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
