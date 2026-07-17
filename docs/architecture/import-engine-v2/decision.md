# Import Engine v2 — ADR

One paragraph per non-obvious choice. Obvious choices (uuid PKs, `created_at`,
cascading FKs to the parent import) are not documented.

## ADR-1 — Unit prices are integer nano-USD; costs are integer bigint micro-USD

The decision §0.3/§23 delegated. Gemini 2.5 Flash-Lite input is $0.10/MTok =
0.1 micro-USD per token — sub-integer, so the spec's `price_per_unit_micro_usd`
column cannot be an integer, and float or NUMERIC money was ruled out by the
spec itself. Chosen: `price_per_unit_nano_usd bigint` — 10⁻⁹ USD per unit.
Every known and plausible seed is an exact integer (Gemini text 100, Gemini
audio 300, Claude Haiku input 1,000, output 5,000, Apify result 2,700,000),
one column, one scale, headroom to $9.2 billion per unit. Computed **costs**
remain integer micro-USD (`bigint`) everywhere, per §23's `$1.00 = 1,000,000
micro-USD`. Rejected: `numeric(20,10)` (exact but arrives in the JS client as
a string, inviting `parseFloat` — a float-money hole one `Number()` away);
float (banned outright); integer micro-USD per *million* units (breaks
per-result pricing — "micro-USD per million Apify results" is absurd — and
forces two conventions in one column).

## ADR-2 — Cost conversion: round-half-up per component, at attempt write time

`cost_micro_usd = (units × price_nano + 500) div 1000` in integer arithmetic,
computed once per cost component (input, output) when the attempt row is
closed, then summed into stored totals. Totals upward (`total_cost_micro_usd`
on the attempt, then on the import) are sums of already-stored integers —
never re-derived from units, so a later price change cannot silently rewrite
history. Overflow: max realistic product is ~10⁶ tokens × 5×10³ nano = 5×10⁹ —
within JS safe-integer range (2⁵³) by seven orders of magnitude; the engine
guards `units < 10⁹` and falls back to `cost_accuracy='estimated'` beyond it.
Rejected: rounding at display time (ledger rows must be summable without
knowing prices), and banker's rounding (no material fairness gain at
micro-USD granularity; half-up is what a human auditing the ledger expects).

## ADR-3 — Extend `recipe_imports`, nullable `state` for legacy rows

A fresh `recipe_imports_v2` table was rejected: the rate limiter
(`imports_since`), the URL cache and the account-deletion cascade all hang off
the existing table, and splitting the ledger would make the daily cap
double-countable. Instead the table is extended additively and `state IS NULL`
is the explicit marker for a v1 row. The alternative — backfilling `state
NOT NULL` now — is a non-null backfill on a populated table, which is
destructive by policy and adds nothing this story needs; it is flagged for
approval in `migration.md`.

## ADR-4 — New `source_kind` column instead of widening the shared `source_type` enum

`public.source_type` (`manual`/`instagram`/`website`) is shared with
`recipes.source_type`. Widening it to the eight §6 import kinds would leak
import-pipeline vocabulary into the recipes domain forever (enum values cannot
be removed without a type rebuild). A separate CHECK-constrained `source_kind`
on `recipe_imports` keeps the coarse recipe-facing enum stable and the
import-granular vocabulary local. The legacy `source_type` column continues to
be written (coarse mapping) so v1 readers keep working until the flagged cleanup.

## ADR-5 — Two Postgres enums, CHECK-text for everything else

`import_state` and `import_failure_reason` are enums: they are the two
API-visible vocabularies with the most call sites (both attempt tables, the
import row, the envelope), and enum typos become insert errors rather than
silent ledger corruption. Every other small vocabulary (`source_kind`,
`status`, `purpose`, `cost_accuracy`, `unit_type`, `post_type`,
`evidence_status`, `request_modality`) is CHECK-constrained `text`: these grow
with every new provider/resolver, and a CHECK edit is an ordinary additive
migration with no `ALTER TYPE ... ADD VALUE` transaction-ordering hazards and
no cross-table type coupling. `unit_type` deliberately has **no** CHECK — the
pricing table is operator-managed, new unit types arrive with new providers,
and the zod schema in `src/lib/import/schema.ts` validates app-side.

## ADR-6 — The import row is the idempotency record; claim by INSERT … ON CONFLICT

No idempotency side table. The unique partial index on `(user_id,
idempotency_key)` plus `INSERT ... ON CONFLICT DO NOTHING RETURNING id` makes
the claim atomic — the row that wins the insert *is* the lock, the audit
record, and the status object, satisfying §22's "return existing completed /
return current status / create only when rules permit" with one structure. A
side table (used successfully on bbbk) earns its keep when idempotency must
wrap many heterogeneous operations; here every idempotent unit is either the
import itself (this table) or a paid call (the attempt ledger, ADR-7), so a
third structure would be duplication.

## ADR-7 — Attempt rows are a write-ahead ledger; single-writer via CAS transitions

Every paid call is preceded by inserting its attempt row (`status='started'`)
and followed by exactly one closing UPDATE. Combined with the unique
`(recipe_import_id, attempt_number)` index and the compare-and-set state
transitions on the import row (`UPDATE ... WHERE id = ? AND state = ?`, 0 rows
⇒ abandon), this gives §22's per-call guarantee *structurally*: a crashed
invocation leaves a `started` row that the resumed invocation sees and closes;
a raced invocation loses either the CAS or the unique index before any money
moves. Rejected: an advisory-lock or queue-based single-writer — correct but a
new infrastructure dependency the cardinality (§ access-patterns) does not
justify on Vercel serverless.

## ADR-8 — Ledger tables are service-role-only; client INSERT revoked on `recipe_imports`

v1 let the authenticated client insert its own import rows; v2 costs are a
financial ledger, and a client that can write ledger rows can forge costs,
states, or cached payloads (self-harm only in a sole-user app, but the grant
is simply not needed once the pipeline is server-side). `authenticated` keeps
owner-scoped SELECT on `recipe_imports` (status polling reads); the attempt
tables and pricing get **no** client grants at all — nothing in any shipped UI
reads them, and the admin surface runs server-side. Least surface now; grants
are additive later if a UI earns them.

## ADR-9 — `model_id` uses a `'*'` wildcard, not NULL, in the pricing key

Apify pricing is model-agnostic. A nullable `model_id` breaks the partial
unique index (`NULL ≠ NULL` in a unique constraint), which would allow two
"current" Apify prices. `NOT NULL DEFAULT '*'` keeps the four-column key a
plain unique index and makes the wildcard explicit in queries
(`model_id = coalesce(:model, '*')` with an exact-match-first fallback in the
resolver helper).

## ADR-10 — Synchronous pipeline in one server action; state machine persisted for audit, not orchestration

The §21 states suggest a queue; the deployment reality (Vercel serverless,
sole user, ≤ 25 imports/day) does not justify one. The whole pipeline runs
inside the submitting server action; state transitions are persisted (W2) so
that (a) AC7's audit trail exists, (b) a concurrent duplicate submission can
report honest in-flight status (AC6), and (c) a killed invocation is
detectable. Abandonment is handled lazily: any non-terminal import with
`updated_at` older than 10 minutes is failed on next read (R7) — no sweeper,
no cron. If import volume ever outgrows a single invocation's time budget,
the queue is a build-time change behind the same state machine; the schema
does not move.

## ADR-11 — Groups/ranges/alternatives are relational, not a JSONB blob on `recipes`

The review/save story must edit groups and ingredients individually, and
grocery logic already consumes `recipe_ingredients` rows
(`grocery_ingredient_provenance` migration); a JSONB recipe body would either
duplicate ingredients (drift in two directions) or force grocery to parse
JSON. A side table (`recipe_ingredient_groups`) plus columns on the existing
children keeps one home per fact. `alternative_group` is an opaque uuid token
rather than an FK-backed table because alternatives have no attributes of
their own — a table with only an id earns nothing. `ingredientGroupReferences`
on steps is *not* persisted (no consuming read yet); it survives in the
`extracted` payload until a story needs it.

## ADR-12 — `evidence` and `raw_usage_json` are JSONB audit blobs, never query surfaces

`SourceEvidence` is stored on the import row so the correction attempt and the
review flow reuse it without re-retrieval (a second paid call to fix a comma
would violate the cheapest-first principle), and provider usage blocks are
stored per attempt for cost auditability. Neither is indexed or filtered on;
both are size-bounded by the existing capped-fetch machinery. §26 compliance:
`raw_usage_json` holds usage metadata only — never response content, never
caption text; `error_message_safe` is the only human-readable provider-adjacent
text and is sanitised in the adapter.
