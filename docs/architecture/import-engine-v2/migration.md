# Import Engine v2 — Migration Plan

One migration file: `supabase/migrations/<ts>_import_engine_v2.sql`.
Forward-only, additive throughout — no drop, no narrowing, no non-null
backfill. Supabase runs migrations inside a transaction, so
`CREATE INDEX CONCURRENTLY` is unavailable; at the current cardinality
(thousands of rows) every plain `CREATE INDEX` below holds its lock for
milliseconds, which is acceptable. All `ADD COLUMN` statements use constant
defaults — no table rewrite on this Postgres version.

## Steps, in order

1. **Create enums** `import_state`, `import_failure_reason`.
   Safe: new types, no existing dependents.
2. **Create `external_service_pricing`** + partial unique index
   `external_service_pricing_current_idx`. Safe: new table.
3. **Seed pricing rows** (integer nano-USD per unit; sources: spec §0.3/§16,
   verified against current Anthropic pricing 2026-07-17):

   | provider | service | model | unit_type | nano-USD/unit |
   |---|---|---|---|---|
   | anthropic | messages | claude-haiku-4-5 | input_token | 1000 |
   | anthropic | messages | claude-haiku-4-5 | output_token | 5000 |
   | anthropic | messages | claude-haiku-4-5 | cached_input_token | 100 |
   | anthropic | messages | claude-haiku-4-5 | cache_creation_input_token | 1250 |
   | google | messages | gemini-2.5-flash-lite | input_token | 100 |
   | google | messages | gemini-2.5-flash-lite | image_input_token | 100 |
   | google | messages | gemini-2.5-flash-lite | video_input_token | 100 |
   | google | messages | gemini-2.5-flash-lite | audio_input_token | 300 |
   | google | messages | gemini-2.5-flash-lite | output_token | 400 |
   | google | url_context | gemini-2.5-flash-lite | input_token | 100 |
   | google | url_context | gemini-2.5-flash-lite | output_token | 400 |
   | apify | instagram_scraper | * | result | 2700000 |

   Gemini rows are seeded now even without a key — pricing is inert data, and
   the config-gated rung activates without a schema change (§0.1). Seeds are
   idempotent (`ON CONFLICT DO NOTHING` against the partial unique index is
   not directly expressible — use a `WHERE NOT EXISTS` guard per row so
   `db reset` and re-runs are safe).
4. **Create `source_retrieval_attempts`** + unique
   `(recipe_import_id, attempt_number)`. RLS enable + force; **no grants** to
   `authenticated`. Safe: new table.
5. **Create `ai_extraction_attempts`** + unique
   `(recipe_import_id, attempt_number)`. RLS enable + force; no grants. Safe.
6. **Extend `recipe_imports`** — `ADD COLUMN` ×10 per `schema.md`
   (`state`, `failure_reason`, `idempotency_key`, `source_kind` with CHECK,
   `evidence`, `schema_version DEFAULT 1`, `quality_score` with CHECK,
   `accepted_resolver_id`, `total_cost_micro_usd DEFAULT 0`, `updated_at`)
   + `set_updated_at` trigger + partial unique index
   `recipe_imports_user_idem_key_uidx`. All nullable or constant-default —
   no rewrite; legacy rows are valid as-is (`state IS NULL` ⇒ v1 row).
7. **Grant change on `recipe_imports`:**
   `REVOKE INSERT ON public.recipe_imports FROM authenticated;`
   Not destructive (no data touched); it removes a client capability that v2
   code no longer uses in the same deploy that removes its last caller
   (`src/lib/import/` v1 is replaced wholesale this story). **Rollback:** a
   one-line re-grant. Barry must land this migration and the action rewrite in
   the same PR-able unit so no deployed client retains a revoked write path.
8. **Create `recipe_ingredient_groups`** + `(recipe_id, position)` index +
   RLS (enable, force, owner-all policy via `owns_recipe`, grants matching the
   other recipe children). Safe: new table.
9. **Extend `recipe_ingredients`** — `ADD COLUMN group_id` (FK, ON DELETE
   CASCADE), `quantity_value`, `quantity_min`, `quantity_max` (+ pair/order
   CHECK), `preparation`, `optional DEFAULT false`, `alternative_group`;
   + `(group_id)` index. All nullable/constant-default — no rewrite.
10. **Extend `recipe_steps`** — `ADD COLUMN title text`. Safe.

## Concurrent-write safety summary

Every step is safe under live traffic: new objects (1–5, 8), nullable/default
column adds (6, 9, 10), a grant change (7), and short-lock index builds on
small tables. No step changes the shape or meaning of existing data — v1 rows
keep working against v1 columns until the flagged cleanup below is approved.

## Flagged for approval — destructive, NOT in this migration

These are proposed for a **later cleanup migration**, after
`import-admin-usage-v2` ships and nothing reads the v1 columns. Freddi
decides; the spec does not wave them through. Escalated in the story file
under *Open questions for Freddi*.

1. **Backfill + NOT NULL on `recipe_imports.state`.** Mapping for legacy
   rows: `status='success' AND recipe_id IS NOT NULL → 'saved'`;
   `status='success' AND recipe_id IS NULL → 'ready_for_review'`;
   `status='no_recipe' → 'failed' + failure_reason='insufficient_content'`;
   `status='failed' → 'failed' + failure_reason='unknown_error'`.
   Risk: a non-null backfill on a populated table; mapping is lossy in intent
   (v1 `no_recipe` conflates `not_a_recipe`/`insufficient_content`).
   **Rollback:** `state` back to nullable; original `status` column is the
   untouched source of truth until step 2 below.
2. **Drop v1 columns** `status`, `method`, `estimated_cost_cents`,
   `media_url`, and the `import_status` enum type. Risk: irreversible loss of
   the v1 ledger's original representation (costs survive only as the cents
   figures; v2 rows never wrote these columns). **Rollback:** none after the
   drop — hence the approval gate. Until approved, the columns cost a few
   bytes per legacy row and nothing else.
