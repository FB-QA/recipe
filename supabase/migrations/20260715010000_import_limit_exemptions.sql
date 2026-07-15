-- ============================================================
-- 0005 — import_limit_exemptions
-- Users listed here skip the daily import cap. Rows are granted by the
-- operator directly against the database — there is no UI and no client
-- write path, so a user cannot exempt themselves. The app only ever asks
-- "am I exempt?", and RLS lets each user see no row but their own.
-- ============================================================

create table public.import_limit_exemptions (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.import_limit_exemptions enable row level security;
alter table public.import_limit_exemptions force row level security;

-- Read-only from the client: no insert/update/delete grants at all.
grant select on public.import_limit_exemptions to authenticated;

-- The operator path. The service key never reaches a client, so this is the
-- same trust boundary as running SQL directly — it exists so admin tooling
-- (and the E2E suite's local seeding) can grant and revoke exemptions.
grant select, insert, delete on public.import_limit_exemptions to service_role;

create policy "exemptions: owner select" on public.import_limit_exemptions
  for select using ((select auth.uid()) = user_id);
