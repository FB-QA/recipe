# Import Engine v2 — Access Patterns

Every read and write the surface performs. Schema, indexes, and API contract
derive from this list — no query exists at build time that is not named here.
A query outside this catalogue is a Channel-2 escalation, not a silent addition.

## Cardinality assumptions (the unit of decision)

- **Users:** O(1–10). Sole-operator app; auth exists but there is no tenant fan-out.
- **`recipe_imports`:** capped at 25/user/day (`limit.ts`) → low thousands of
  rows per year. Design point: **thousands**, not millions.
- **`source_retrieval_attempts`:** ≤ 3 rungs × (1 + 2 retries) per import, in
  practice 1–3 rows per import → same order as imports, ×2.
- **`ai_extraction_attempts`:** 1 + ≤2 retries + ≤1 correction per import,
  in practice 1–2 rows per import.
- **`external_service_pricing`:** dozens of rows, ever. Operator-managed.
- **`recipes` + children:** hundreds of recipes, ~10–40 ingredients and
  ~5–15 steps each → tens of thousands of child rows at most.

At these cardinalities every index below exists for **correctness (uniqueness,
FK cascade) or a hot point-lookup**, never for scan avoidance on large tables.
Admin rollups (next story) may sequential-scan freely.

## Reads

### R1 — Idempotency claim lookup
- **Query:** `SELECT * FROM recipe_imports WHERE user_id = ? AND idempotency_key = ?`
- **Fields:** full row (state, failure_reason, extracted, evidence, total_cost_micro_usd).
- **Cardinality:** 0–1 rows. Selectivity: unique.
- **Drives:** import-drawer and paste-flow submit (AC6) — second submission of
  the same key returns the first's result or in-flight status.
- **Index:** unique partial `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. One B-tree descent.
- **Failure mode:** row exists in a terminal state → return it; row exists
  in-flight → return `processing`; row in-flight but `updated_at` older than
  10 minutes → lazily transition to `failed`/`unknown_error` (R7) and report that.

### R2 — Import status by id
- **Query:** `SELECT ... FROM recipe_imports WHERE id = ?`
- **Cardinality:** 1 row (PK).
- **Drives:** `getImportStatus` action — drawer polling while an import is in flight.
- **Failure mode:** id not found (foreign user via RLS, or bogus id) → `failed`/`invalid_input` envelope, never a throw.

### R3 — URL cache lookup (free re-import)
- **Query:** `SELECT ... FROM recipe_imports WHERE user_id = ? AND source_url = ?
  AND state IN ('ready_for_review','saved') AND extracted IS NOT NULL
  ORDER BY created_at DESC LIMIT 1`
- **Cardinality:** 0–few rows. Existing index `recipe_imports_user_url_idx (user_id, source_url)` covers the filter; the residual sort is over a handful of rows.
- **Drives:** AC1/AC3 cost discipline — a previously accepted extraction is
  reused with zero attempts. v1 behaviour carried forward.
- **Failure mode:** legacy rows (`state IS NULL`) are excluded by the state
  filter — v1 cached payloads have the old `ExtractedRecipe` shape and must not
  be served through the v2 envelope.

### R4 — Rolling rate-limit count
- **Query:** existing `imports_since(cutoff)` SECURITY DEFINER RPC —
  `COUNT(*) WHERE user_id = auth.uid() AND created_at >= ?`.
- **Index:** existing `recipe_imports_user_created_idx (user_id, created_at DESC)`. Range scan over ≤25 rows.
- **Drives:** policy check state (`policy_checked`). Unchanged from v1.

### R5 — Attempt guard (per-call idempotency, §22)
- **Query:** `SELECT attempt_number, status, resolver_id FROM
  source_retrieval_attempts WHERE recipe_import_id = ?` (and the analogue on
  `ai_extraction_attempts`).
- **Cardinality:** ≤ 6 rows.
- **Drives:** the orchestrator, before every paid call — a crashed invocation
  resumed via R1/R7 must see which paid calls already ran and not repeat them.
- **Index:** unique `(recipe_import_id, attempt_number)` serves both the guard
  read and the uniqueness that makes double-billing structurally impossible.
- **Failure mode:** a `started` attempt with no `completed_at` and a stale
  import row means a crash mid-call — the attempt is closed as `failed` before
  any new attempt is opened.

### R6 — Pricing resolution
- **Query:** `SELECT price_per_unit_nano_usd FROM external_service_pricing
  WHERE provider_id = ? AND service_id = ? AND model_id = ? AND unit_type = ?
  AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())`
- **Cardinality:** dozens of rows total; 1 row expected. `model_id` uses the
  `'*'` wildcard row for model-agnostic services (Apify).
- **Drives:** cost columns on every attempt row (AC7).
- **Index:** unique partial `(provider_id, service_id, model_id, unit_type)
  WHERE effective_to IS NULL` — exists for the *one current price* invariant;
  the lookup itself would be fine as a seq scan at this size.
- **Failure mode:** no row → the attempt is still recorded, with
  `cost_micro_usd = 0` and `cost_accuracy = 'none'`. A missing price never
  blocks an import; it degrades the ledger honestly.

### R7 — Stale in-flight detection
- Not a scan: applied to the single row already fetched by R1/R2. An import in
  a non-terminal state with `updated_at < now() − 10 min` is treated as
  abandoned (serverless invocation died) and CAS-transitioned to
  `failed`/`unknown_error` on read. No index, no sweeper process.

### R8 — Recipe detail with groups (schema lands now; save path next story)
- **Query:** `recipes` by PK, then `recipe_ingredient_groups WHERE recipe_id = ?
  ORDER BY position`, `recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order`,
  `recipe_steps WHERE recipe_id = ? ORDER BY sort_order`.
- **Cardinality:** 1 + ~3 + ~25 + ~10 rows.
- **Drives:** `import-capture-review-v2` preview/detail rendering of groups,
  ranges, alternatives, step titles (AC2/AC5 fidelity, persisted).
- **Indexes:** new `(recipe_id, position)` on groups; existing child indexes
  already cover ingredients/steps.

### R9 — Admin usage rollups (out of scope, named to reserve the decision)
- `import-admin-usage-v2` will aggregate attempts and imports by day, source
  kind, resolver, provider. At tens of thousands of rows these are seq scans
  and that is correct. **No indexes are added for R9 in this story** — see
  `indexes.md`, "Indexes not to add".

## Writes

### W1 — Claim an import (idempotency lock)
- **Statement:** `INSERT INTO recipe_imports (user_id, idempotency_key,
  source_kind, source_url, state, schema_version, ...) VALUES (..., 'created', 2)
  ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING id`
- **Semantics:** the import row **is** the idempotency record — no side table.
  Zero rows returned ⇒ a concurrent submission won the race ⇒ fall through to
  R1 and return the winner's status. A double click can never open two pipelines (AC6).
- **Writer:** service-role client. `authenticated` loses its INSERT grant (see `migration.md`).

### W2 — State transition (compare-and-set)
- **Statement:** `UPDATE recipe_imports SET state = :next, failure_reason = ?,
  quality_score = ?, evidence = ?, extracted = ?, accepted_resolver_id = ?,
  total_cost_micro_usd = total_cost_micro_usd + :delta
  WHERE id = ? AND state = :expected`
- **Semantics:** 0 rows updated ⇒ another invocation owns the import (or R7
  failed it) ⇒ abandon silently, make no further paid calls. This CAS is the
  single-writer guarantee the attempt ledger relies on.
- **Transaction boundary:** each transition is one statement; the pipeline
  holds no long transaction across network calls to providers.

### W3 — Retrieval attempt, write-ahead
- **Statements:** `INSERT INTO source_retrieval_attempts (recipe_import_id,
  user_id, attempt_number, resolver_id, status) VALUES (?, ?, :n, ?, 'started')`
  **before** the external call; one `UPDATE ... SET status, failure_reason,
  response_status, content_bytes, evidence_status, units_used, unit_type,
  cost_micro_usd, cost_accuracy, raw_usage_json, latency_ms, completed_at ...`
  after it.
- **Semantics:** `attempt_number` = max+1 within the invocation (safe under the
  W2 single-writer CAS); the unique index rejects a duplicate from any raced
  invocation before money is spent. A skipped rung (Gemini with no
  `GOOGLE_API_KEY`, §0.1) is **recorded** as a row with `status='unavailable'`
  and zero cost — never silently absent.
- **Cost rule:** `cost_micro_usd = round_half_up(units_used ×
  price_per_unit_nano_usd / 1000)`, integer arithmetic, per attempt (see
  `decision.md` ADR-1/2). Direct retrieval records `units_used = 1,
  unit_type = 'request', cost_micro_usd = 0, cost_accuracy = 'metered'` —
  execution count and latency still tracked per §23.

### W4 — AI attempt, write-ahead
- Same insert-then-update shape on `ai_extraction_attempts`, with
  `purpose ∈ ('initial','retry','correction')` mapping to the §23 cost
  categories, per-modality token columns from the provider's usage block, and
  `input_cost_micro_usd`/`output_cost_micro_usd` computed per unit_type then
  summed into `total_cost_micro_usd`.
- **Failure mode (AC8):** schema-invalid output closes the attempt as
  `failed`/`error_code='schema_invalid'`; exactly one further row with
  `purpose='correction'` may follow; content failures (`not_recipe`,
  `insufficient_content`, safety block) close the attempt and the guard (R5)
  refuses any retry.

### W5 — Pricing lifecycle
- Seeds in the migration (see `migration.md`). Operator price change: `UPDATE
  ... SET effective_to = now() WHERE ... AND effective_to IS NULL` then
  `INSERT` the new row — the partial unique index makes an overlapping
  "current" row impossible.

### W6 — Save path (next story, boundary named now)
- One transaction: insert `recipes` row, insert groups, insert ingredients
  (with `group_id`), insert steps; on edit-resave, **wholesale replace**
  children by `recipe_id` (delete groups + ingredients + steps by `recipe_id`,
  reinsert). The `(group_id)` index on ingredients exists for the group-delete
  cascade inside that replace.
