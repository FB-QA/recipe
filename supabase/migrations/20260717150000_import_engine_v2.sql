-- ============================================================
-- 0006 — import engine v2
-- Ledger tables, pricing, recipe_imports extension, and the relational
-- groups/ranges/alternatives extension of the recipe children.
-- Contract: docs/architecture/import-engine-v2/{schema,indexes,migration}.md
-- Forward-only and additive; the destructive v1 cleanup is a separate,
-- flagged migration (see migration.md "Flagged for approval").
-- ============================================================

-- ------------------------------------------------------------
-- Step 1 — enums (ADR-5: only the two API-visible vocabularies)
-- ------------------------------------------------------------
create type public.import_state as enum (
  'created', 'policy_checked', 'retrieving_source',
  'source_partially_retrieved', 'source_retrieved', 'parsing_source',
  'ai_not_required', 'queued_for_ai', 'ai_processing', 'validating',
  'ready_for_review', 'saved', 'failed', 'cancelled'
);

create type public.import_failure_reason as enum (
  'unauthenticated', 'plan_restricted', 'invalid_input',
  'unsupported_source', 'source_retrieval_failed', 'source_incomplete',
  'source_too_large', 'source_timeout', 'login_wall_detected',
  'private_content', 'deleted_content', 'not_a_recipe',
  'insufficient_content', 'ai_rate_limited', 'ai_provider_error',
  'ai_safety_block', 'ai_output_invalid', 'validation_failed',
  'temporary_media_cleanup_failed', 'unknown_error'
);

-- ------------------------------------------------------------
-- Step 2 — external_service_pricing (ADR-1: integer nano-USD per unit)
-- ------------------------------------------------------------
create table public.external_service_pricing (
  id                       uuid primary key default gen_random_uuid(),
  provider_id              text not null,
  service_id               text not null,
  model_id                 text not null default '*',  -- '*' = model-agnostic (ADR-9)
  unit_type                text not null,              -- no CHECK by design (ADR-5)
  price_per_unit_nano_usd  bigint not null check (price_per_unit_nano_usd >= 0),
  currency                 char(3) not null default 'USD',
  effective_from           timestamptz not null default now(),
  effective_to             timestamptz,
  created_at               timestamptz not null default now()
);

-- One current price per key (serves R6 + the W5 invariant).
create unique index external_service_pricing_current_idx
  on public.external_service_pricing (provider_id, service_id, model_id, unit_type)
  where effective_to is null;

alter table public.external_service_pricing enable row level security;
alter table public.external_service_pricing force row level security;
revoke all on public.external_service_pricing from anon, authenticated;
grant select, insert, update on public.external_service_pricing to service_role;

-- ------------------------------------------------------------
-- Step 3 — pricing seeds (idempotent via WHERE NOT EXISTS; the partial
-- unique index cannot back ON CONFLICT directly). Sources: spec §0.3/§16,
-- verified against current Anthropic pricing 2026-07-17.
-- ------------------------------------------------------------
insert into public.external_service_pricing
  (provider_id, service_id, model_id, unit_type, price_per_unit_nano_usd)
select v.provider_id, v.service_id, v.model_id, v.unit_type, v.price
from (values
  ('anthropic', 'messages',          'claude-haiku-4-5',      'input_token',                1000::bigint),
  ('anthropic', 'messages',          'claude-haiku-4-5',      'output_token',               5000::bigint),
  ('anthropic', 'messages',          'claude-haiku-4-5',      'cached_input_token',          100::bigint),
  ('anthropic', 'messages',          'claude-haiku-4-5',      'cache_creation_input_token', 1250::bigint),
  ('google',    'messages',          'gemini-2.5-flash-lite', 'input_token',                 100::bigint),
  ('google',    'messages',          'gemini-2.5-flash-lite', 'image_input_token',           100::bigint),
  ('google',    'messages',          'gemini-2.5-flash-lite', 'video_input_token',           100::bigint),
  ('google',    'messages',          'gemini-2.5-flash-lite', 'audio_input_token',           300::bigint),
  ('google',    'messages',          'gemini-2.5-flash-lite', 'output_token',                400::bigint),
  ('google',    'url_context',       'gemini-2.5-flash-lite', 'input_token',                 100::bigint),
  ('google',    'url_context',       'gemini-2.5-flash-lite', 'output_token',                400::bigint),
  ('apify',     'instagram_scraper', '*',                     'result',                  2700000::bigint)
) as v(provider_id, service_id, model_id, unit_type, price)
where not exists (
  select 1 from public.external_service_pricing p
  where p.provider_id = v.provider_id
    and p.service_id  = v.service_id
    and p.model_id    = v.model_id
    and p.unit_type   = v.unit_type
    and p.effective_to is null
);

-- ------------------------------------------------------------
-- Step 4 — source_retrieval_attempts (write-ahead ledger, W3)
-- ------------------------------------------------------------
create table public.source_retrieval_attempts (
  id                  uuid primary key default gen_random_uuid(),
  recipe_import_id    uuid not null references public.recipe_imports (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  attempt_number      smallint not null,
  resolver_id         text not null,
  provider_id         text,
  service_id          text,
  status              text not null default 'started'
                        check (status in ('started','succeeded','failed','unavailable')),
  failure_reason      public.import_failure_reason,
  response_status     smallint,
  content_type        text,
  content_bytes       integer,
  caption_retrieved   boolean,
  media_count         smallint,
  post_type           text check (post_type in ('single_image','carousel','reel','unknown')),
  evidence_status     text check (evidence_status in ('complete','partial','unavailable','unsupported')),
  provider_request_id text,
  external_run_id     text,
  units_used          bigint,
  unit_type           text,
  cost_micro_usd      bigint not null default 0,
  cost_accuracy       text not null default 'none'
                        check (cost_accuracy in ('metered','estimated','none')),
  raw_usage_json      jsonb,
  latency_ms          integer,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (recipe_import_id, attempt_number)
);

alter table public.source_retrieval_attempts enable row level security;
alter table public.source_retrieval_attempts force row level security;
-- Service-role only: no client reads attempts this story (ADR-8).
revoke all on public.source_retrieval_attempts from anon, authenticated;
grant select, insert, update on public.source_retrieval_attempts to service_role;

-- ------------------------------------------------------------
-- Step 5 — ai_extraction_attempts (write-ahead ledger, W4)
-- ------------------------------------------------------------
create table public.ai_extraction_attempts (
  id                      uuid primary key default gen_random_uuid(),
  recipe_import_id        uuid not null references public.recipe_imports (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  attempt_number          smallint not null,
  purpose                 text not null default 'initial'
                            check (purpose in ('initial','retry','correction')),
  provider_id             text not null,
  model_id                text not null,
  model_version           text,
  provider_request_id     text,
  request_modality        text not null default 'text'
                            check (request_modality in ('text','image','video','audio','mixed')),
  status                  text not null default 'started'
                            check (status in ('started','succeeded','failed')),
  failure_reason          public.import_failure_reason,
  finish_reason           text,
  input_text_tokens       integer,
  input_image_tokens      integer,
  input_video_tokens      integer,
  input_audio_tokens      integer,
  tool_use_input_tokens   integer,
  cached_input_tokens     integer,
  output_candidate_tokens integer,
  output_thinking_tokens  integer,
  output_tokens_total     integer,
  input_cost_micro_usd    bigint not null default 0,
  output_cost_micro_usd   bigint not null default 0,
  total_cost_micro_usd    bigint not null default 0,
  cost_accuracy           text not null default 'none'
                            check (cost_accuracy in ('metered','estimated','none')),
  latency_ms              integer,
  error_code              text,
  error_message_safe      text,
  raw_usage_json          jsonb,
  started_at              timestamptz not null default now(),
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  unique (recipe_import_id, attempt_number)
);

alter table public.ai_extraction_attempts enable row level security;
alter table public.ai_extraction_attempts force row level security;
revoke all on public.ai_extraction_attempts from anon, authenticated;
grant select, insert, update on public.ai_extraction_attempts to service_role;

-- ------------------------------------------------------------
-- Step 6 — extend recipe_imports (nullable state marks legacy v1 rows, ADR-3)
-- ------------------------------------------------------------
alter table public.recipe_imports
  add column state                public.import_state,
  add column failure_reason       public.import_failure_reason,
  add column idempotency_key      uuid,
  add column source_kind          text check (source_kind in (
    'pasted_text','website','instagram_post','instagram_carousel',
    'instagram_reel','screenshot','uploaded_image','uploaded_video')),
  add column evidence             jsonb,
  add column schema_version       smallint not null default 1,
  add column quality_score        smallint check (quality_score between 0 and 100),
  add column accepted_resolver_id text,
  add column total_cost_micro_usd bigint not null default 0,
  add column updated_at           timestamptz not null default now();

create trigger recipe_imports_set_updated_at
  before update on public.recipe_imports
  for each row execute function public.set_updated_at();

-- The AC6 idempotency claim (R1/W1). Partial: legacy rows carry NULL keys.
create unique index recipe_imports_user_idem_key_uidx
  on public.recipe_imports (user_id, idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------------------
-- Step 7 — grant change: v2 writes go through the service role only.
-- The v1 client insert path is removed in the same deploy (ADR-8).
-- Rollback: grant insert on public.recipe_imports to authenticated;
-- ------------------------------------------------------------
revoke insert on public.recipe_imports from authenticated;
grant select, insert, update on public.recipe_imports to service_role;

-- W2 — compare-and-set state transition, exactly as declared in
-- access-patterns.md. Lives in a function because PostgREST cannot express
-- `total = total + delta`; the query shape is unchanged. SECURITY DEFINER
-- but callable by service_role only.
create or replace function public.import_transition(
  p_id             uuid,
  p_expected       public.import_state,
  p_next           public.import_state,
  p_failure_reason public.import_failure_reason default null,
  p_quality_score  smallint default null,
  p_evidence       jsonb default null,
  p_extracted      jsonb default null,
  p_accepted_resolver_id text default null,
  p_cost_delta     bigint default 0
)
returns boolean
language sql
security definer
volatile
set search_path = public
as $$
  with updated as (
    update public.recipe_imports set
      state                = p_next,
      failure_reason       = coalesce(p_failure_reason, failure_reason),
      quality_score        = coalesce(p_quality_score, quality_score),
      evidence             = coalesce(p_evidence, evidence),
      extracted            = coalesce(p_extracted, extracted),
      accepted_resolver_id = coalesce(p_accepted_resolver_id, accepted_resolver_id),
      total_cost_micro_usd = total_cost_micro_usd + p_cost_delta
    where id = p_id and state = p_expected
    returning id
  )
  select exists (select 1 from updated);
$$;

revoke execute on function public.import_transition from public, anon, authenticated;
grant execute on function public.import_transition to service_role;

-- ------------------------------------------------------------
-- Step 8 — recipe_ingredient_groups (ADR-11: relational, not JSONB)
-- ------------------------------------------------------------
create table public.recipe_ingredient_groups (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  name       text,                       -- null = the single unnamed group (renders no heading, §18)
  position   smallint not null default 0,
  optional   boolean not null default false
);

create index recipe_ingredient_groups_recipe_idx
  on public.recipe_ingredient_groups (recipe_id, position);

alter table public.recipe_ingredient_groups enable row level security;
alter table public.recipe_ingredient_groups force row level security;
grant select, insert, update, delete on public.recipe_ingredient_groups to authenticated;

create policy "ingredient groups: owner all" on public.recipe_ingredient_groups
  for all using (public.owns_recipe(recipe_id)) with check (public.owns_recipe(recipe_id));

-- ------------------------------------------------------------
-- Step 9 — extend recipe_ingredients (groups, ranges, alternatives)
-- ------------------------------------------------------------
alter table public.recipe_ingredients
  add column group_id          uuid references public.recipe_ingredient_groups (id) on delete cascade,
  add column quantity_value    numeric,
  add column quantity_min      numeric,
  add column quantity_max      numeric,
  add column preparation       text,
  add column optional          boolean not null default false,
  add column alternative_group uuid,
  add constraint recipe_ingredients_range_pair_chk
    check ((quantity_min is null) = (quantity_max is null)),
  add constraint recipe_ingredients_range_order_chk
    check (quantity_min is null or quantity_min <= quantity_max);

-- Serves the FK cascade in W6's wholesale-replace (indexes.md #6).
create index recipe_ingredients_group_idx on public.recipe_ingredients (group_id);

-- ------------------------------------------------------------
-- Step 10 — extend recipe_steps (step titles, §18)
-- ------------------------------------------------------------
alter table public.recipe_steps
  add column title text;
