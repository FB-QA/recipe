# Import Engine v2 — Schema

DDL-level specification. Every column is justified by an access pattern in
`access-patterns.md`; columns with no pattern are called out. Exact migration
order and safety notes live in `migration.md`.

## Types have one home

Domain types (source kinds, states, failure reasons, `SourceEvidence`,
`ExtractedRecipe`, envelope types) live in **`src/lib/import/schema.ts`** as
zod schemas with inferred TS types — the v2 replacement of `types.ts`. Every
consumer (actions, resolvers, providers, validation, tests) imports from it;
none redefines. The Postgres enums and CHECK vocabularies below are mirrors of
that file, kept in sync by Barry's contract tests. Redefining any of these
types elsewhere is a Channel-2 deviation.

## Enums (two, deliberately — ADR-5)

```sql
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
```

All other small vocabularies are CHECK-constrained `text` (rationale in
`decision.md` ADR-5). Extending an enum later is `ALTER TYPE ... ADD VALUE` —
additive-safe.

## `recipe_imports` — extended, forward-only (ADR-3)

Existing table; v1 columns (`status`, `method`, `estimated_cost_cents`,
`media_url`) remain untouched for legacy rows. New columns, all additive:

| Column | Type | Justified by |
|---|---|---|
| `state` | `import_state` NULL | R1/R2/R3, W1/W2. **NULL ⇒ legacy v1 row**; every v2 read filters or handles it. |
| `failure_reason` | `import_failure_reason` NULL | AC7; R1/R2 envelope mapping. |
| `idempotency_key` | `uuid` NULL | R1, W1 (AC6). NULL on legacy rows. |
| `source_kind` | `text` NULL CHECK in (`'pasted_text','website','instagram_post','instagram_carousel','instagram_reel','screenshot','uploaded_image','uploaded_video'`) | §6 vocabulary; admin rollups (R9). New column rather than widening the shared `source_type` enum — ADR-4. |
| `evidence` | `jsonb` NULL | Accepted `SourceEvidence` (§7) — the correction attempt (W4) and the review flow need it without re-retrieval; audit for AC4. |
| `schema_version` | `smallint` NOT NULL DEFAULT 1 | Discriminates `extracted` payload shape: 1 = v1 `ExtractedRecipe`, 2 = §18 shape. Engine writes 2 explicitly. |
| `quality_score` | `smallint` NULL CHECK (0–100) | §19; admin "quality score by resolver route". |
| `accepted_resolver_id` | `text` NULL | §18 `source.retrievalMethod` at save; admin per-route rollups. |
| `total_cost_micro_usd` | `bigint` NOT NULL DEFAULT 0 | AC7 `total_import_cost`; accumulated by W2. Integer micro-USD, never float. |
| `updated_at` | `timestamptz` NOT NULL DEFAULT now() + existing `set_updated_at` trigger | R7 stale-in-flight detection. |

`extracted jsonb` is reused for the v2 `ExtractedRecipe` (§18) when the import
reaches `ready_for_review` — discriminated by `schema_version`.

**Grants change (no data loss):** `INSERT` is revoked from `authenticated`;
all v2 writes go through the service-role client so the client cannot forge
ledger rows or cached payloads. `SELECT` (owner-scoped RLS) remains — R1–R4
read with the user's client. Existing append-only rationale (no UPDATE/DELETE
for `authenticated`) is preserved and strengthened.

## `source_retrieval_attempts` — new

One row per resolver-rung execution, including recorded-unavailable rungs.
Write-ahead: inserted `'started'` before the external call (W3).

```sql
create table public.source_retrieval_attempts (
  id                  uuid primary key default gen_random_uuid(),
  recipe_import_id    uuid not null references public.recipe_imports (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  attempt_number      smallint not null,
  resolver_id         text not null,      -- 'instagram_direct' | 'gemini_url_context' | 'apify' | 'website_fetch' | 'pasted_text'
  provider_id         text,               -- 'google' | 'apify' | null (direct fetch)
  service_id          text,               -- 'url_context' | 'instagram_scraper' | null
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
  unit_type           text,               -- 'request' | 'result' | 'input_token' | ...
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
```

**Rationale:** the resolver-chain audit AC3/AC7 demands one row per rung with
outcome and cost; the unique `(recipe_import_id, attempt_number)` pair is the
structural guarantee behind §22's "a double click must never produce two paid
calls of any kind". `user_id` is denormalised from the import row so account
deletion cascades directly and admin rollups avoid a join — at this
cardinality that is convenience, not necessity, and it is set from the import
row, never from client input.

**RLS:** enabled + forced, **no grants to `authenticated`** — service-role
only. No UI reads attempts this story; the admin story runs server-side.

## `ai_extraction_attempts` — new

```sql
create table public.ai_extraction_attempts (
  id                     uuid primary key default gen_random_uuid(),
  recipe_import_id       uuid not null references public.recipe_imports (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,
  attempt_number         smallint not null,
  purpose                text not null default 'initial'
                           check (purpose in ('initial','retry','correction')),
  provider_id            text not null,   -- 'anthropic' | 'google'
  model_id               text not null,
  model_version          text,
  provider_request_id    text,
  request_modality       text not null default 'text'
                           check (request_modality in ('text','image','video','audio','mixed')),
  status                 text not null default 'started'
                           check (status in ('started','succeeded','failed')),
  failure_reason         public.import_failure_reason,
  finish_reason          text,
  input_text_tokens      integer,
  input_image_tokens     integer,
  input_video_tokens     integer,
  input_audio_tokens     integer,
  tool_use_input_tokens  integer,
  cached_input_tokens    integer,
  output_candidate_tokens integer,
  output_thinking_tokens integer,
  output_tokens_total    integer,
  input_cost_micro_usd   bigint not null default 0,
  output_cost_micro_usd  bigint not null default 0,
  total_cost_micro_usd   bigint not null default 0,
  cost_accuracy          text not null default 'none'
                           check (cost_accuracy in ('metered','estimated','none')),
  latency_ms             integer,
  error_code             text,            -- 'schema_invalid' | 'timeout' | 'rate_limited' | provider codes
  error_message_safe     text,            -- sanitised; never raw provider payload text
  raw_usage_json         jsonb,
  started_at             timestamptz not null default now(),
  completed_at           timestamptz,
  created_at             timestamptz not null default now(),
  unique (recipe_import_id, attempt_number)
);
```

**Rationale:** §23's column list plus `purpose`, which maps attempts to the
cost categories (`recipe_extraction_cost` / `retry_cost` /
`correction_attempt_cost`) without a second bookkeeping structure, and
enforces AC8's "exactly one correction" as an orchestrator invariant Barry's
integration tests can pin (`count(*) where purpose='correction' <= 1` per
import). Token columns are `integer` (per-request counts are bounded ≪ 2³¹);
money columns are `bigint` micro-USD uniformly. `raw_usage_json` stores the
provider's usage block only — never response content (§26).

**RLS:** enabled + forced, no `authenticated` grants — identical to
`source_retrieval_attempts`.

## `external_service_pricing` — new

```sql
create table public.external_service_pricing (
  id                       uuid primary key default gen_random_uuid(),
  provider_id              text not null,          -- 'anthropic' | 'google' | 'apify'
  service_id               text not null,          -- 'messages' | 'url_context' | 'instagram_scraper'
  model_id                 text not null default '*',  -- '*' = model-agnostic (ADR-9)
  unit_type                text not null,          -- 'input_token' | 'output_token' | 'cached_input_token'
                                                   -- | 'cache_creation_input_token' | 'audio_input_token'
                                                   -- | 'image_input_token' | 'video_input_token' | 'result'
  price_per_unit_nano_usd  bigint not null check (price_per_unit_nano_usd >= 0),
  currency                 char(3) not null default 'USD',
  effective_from           timestamptz not null default now(),
  effective_to             timestamptz,
  created_at               timestamptz not null default now()
);

create unique index external_service_pricing_current_idx
  on public.external_service_pricing (provider_id, service_id, model_id, unit_type)
  where effective_to is null;
```

**Rationale — the §0.3 representation decision, settled (ADR-1):** unit prices
are **integer nano-USD (10⁻⁹ USD) per unit**. Freddi's spec names the column
`price_per_unit_micro_usd`, but Gemini 2.5 Flash-Lite input at $0.10/MTok is
0.1 micro-USD per token — sub-integer. Nano-USD keeps every seed an integer
(Gemini text input = 100, Claude Haiku input = 1,000 and output = 5,000, Apify
result = 2,700,000 — i.e. 2,700 micro-USD per result) with one column, one
scale, no floats and no NUMERIC round-tripping
through the JS client. Computed **costs** stay integer micro-USD everywhere
(`$1.00 = 1,000,000 micro-USD`, §23). Conversion rule and overflow guard in
`decision.md` ADR-2. Effective-dating (`effective_from`/`effective_to`) keeps
historical attempt costs reproducible after a price change; the partial unique
index enforces exactly one current price per key.

**RLS:** enabled + forced, no `authenticated` grants — the pipeline resolves
prices server-side; nothing client-facing reads this table.

## Recipe schema extension — groups, ranges, alternatives, step titles

Persistence for §18 fidelity (AC2/AC5). The save path is next story
(`import-capture-review-v2`); the DDL lands now so that story is write-path
only. Relational, not JSONB — ADR-11.

### `recipe_ingredient_groups` — new

```sql
create table public.recipe_ingredient_groups (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  name       text,                       -- null = the single unnamed group (renders no heading, §18)
  position   smallint not null default 0,
  optional   boolean not null default false
);
create index recipe_ingredient_groups_recipe_idx
  on public.recipe_ingredient_groups (recipe_id, position);
```

RLS: enabled + forced; owner-all policy via existing `public.owns_recipe(recipe_id)`;
grants mirror the other recipe children (`select, insert, update, delete` to
`authenticated`).

### `recipe_ingredients` — additive columns

| Column | Type | Justified by |
|---|---|---|
| `group_id` | `uuid` NULL REFERENCES `recipe_ingredient_groups(id)` ON DELETE CASCADE | R8 grouping; NULL for pre-v2 recipes (rendered as the unnamed group). |
| `quantity_value` | `numeric` NULL | §18 `quantityValue`; future grocery aggregation. Exact numeric, not float. |
| `quantity_min` | `numeric` NULL | AC2/AC5 ranges — "1–2 tbsp" stays a range. |
| `quantity_max` | `numeric` NULL | Pair of `quantity_min`. CHECK `(quantity_min IS NULL) = (quantity_max IS NULL)` and `quantity_min <= quantity_max`. |
| `preparation` | `text` NULL | §18 `preparation`. |
| `optional` | `boolean` NOT NULL DEFAULT false | §18 optional ingredients. |
| `alternative_group` | `uuid` NULL | §18 `alternativeGroupId` — ingredients sharing a value are genuine alternatives. Opaque token, no FK (it groups rows within one recipe; integrity is the save transaction's job). |

Existing columns carry the rest: `display_text` = `originalText` (verbatim
wording — the fidelity contract), `quantity` = `quantityText`, `unit`, `name`,
`sort_order` = position within group.

### `recipe_steps` — additive column

| Column | Type | Justified by |
|---|---|---|
| `title` | `text` NULL | §18 step titles — only where meaningful, never "Step 1"; NULL otherwise. |

`ingredientGroupReferences` (§18) is **not persisted** in this pass — no read
pattern consumes it yet; it lives in the `extracted` payload and the review
story decides whether it earns a column. Flagged as a deliberate omission, not
an oversight.
