# Import Engine v2 — Indexes

One entry per index, with the access pattern it serves and its cost at the
stated cardinality (thousands of imports, tens of thousands of attempt rows —
see `access-patterns.md`). Every index here exists for a uniqueness invariant,
an FK cascade, or a hot point-lookup. None exists for scan avoidance — at this
size the planner is right to seq-scan anything cold.

## Indexes to add

### 1. `recipe_imports_user_idem_key_uidx`
- **Definition:** `UNIQUE (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — partial B-tree.
- **Serves:** R1 (idempotency lookup) and W1 (`ON CONFLICT` claim). This index
  *is* the AC6 guarantee — the race between two identical submissions is
  resolved by the B-tree, not by application logic.
- **Cost:** one descent; index covers only v2 rows (legacy rows have NULL key).
- **Size:** ≈ rows × 40 bytes → tens of KB.

### 2. `source_retrieval_attempts_import_attempt_uidx`
- **Definition:** `UNIQUE (recipe_import_id, attempt_number)`.
- **Serves:** R5 (attempt guard — prefix scan on `recipe_import_id`, ≤ 6 rows)
  and the §22 structural guarantee that a raced invocation cannot open a
  duplicate paid attempt.
- **Cost:** one descent + tiny range scan.

### 3. `ai_extraction_attempts_import_attempt_uidx`
- **Definition:** `UNIQUE (recipe_import_id, attempt_number)`.
- **Serves:** same as #2 for AI/correction calls; also Barry's
  one-correction-max invariant check.

### 4. `external_service_pricing_current_idx`
- **Definition:** `UNIQUE (provider_id, service_id, model_id, unit_type) WHERE effective_to IS NULL` — partial.
- **Serves:** R6 lookup and, primarily, the *one current price per key*
  invariant behind W5. At dozens of rows the lookup speed is irrelevant; the
  uniqueness is not.

### 5. `recipe_ingredient_groups_recipe_idx`
- **Definition:** `(recipe_id, position)` B-tree.
- **Serves:** R8 ordered group read; matches the established child-table
  pattern (`recipe_ingredients_recipe_idx`, `recipe_steps_recipe_idx`).
- **Cost:** one descent + range over ~3 rows.

### 6. `recipe_ingredients_group_idx`
- **Definition:** `(group_id)` B-tree.
- **Serves:** the FK cascade in W6's wholesale-replace (deleting a recipe's
  groups cascades to ingredients *via group_id*; without this index each group
  delete seq-scans the whole ingredients table inside the save transaction).
  An unindexed FK that takes cascading deletes is a lock-duration bug waiting
  for growth — cheap to prevent now.

## Existing indexes reused (no change)

| Index | Serves |
|---|---|
| `recipe_imports_user_created_idx (user_id, created_at DESC)` | R4 rate-limit window count |
| `recipe_imports_user_url_idx (user_id, source_url)` | R3 URL cache lookup |
| `recipe_ingredients_recipe_idx (recipe_id, sort_order)` | R8 |
| `recipe_steps_recipe_idx (recipe_id, sort_order)` | R8 |

## Indexes NOT to add (and why Barry should not add them either)

- **`recipe_imports (state)`** — 14-value low-cardinality column on a
  thousands-row table; any state-filtered read (R3's residual filter, a future
  sweep) is fine as a seq scan or resolved via an existing index. Selectivity
  too low to earn a B-tree.
- **`(user_id)` or `(created_at)` on either attempt table** — nothing reads
  attempts by user or time in this story. R9 (admin rollups) is the next
  story's decision; adding speculative indexes now is maintenance cost with no
  named query. If the admin story needs them, its Archie pass adds them.
- **Any index on `raw_usage_json` / `evidence` (GIN)** — no query filters
  inside these payloads; they are audit blobs.
- **`external_service_pricing (effective_from)`** — dozens of rows; the
  partial unique index plus a seq scan covers every temporal read.
- **Trigram/search indexes** — no search access pattern exists on this
  surface; one search strategy per surface, and this surface has none.
