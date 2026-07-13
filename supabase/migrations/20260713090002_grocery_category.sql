-- ============================================================
-- 0007 — categorise grocery items (dairy, meat, produce…)
-- Category is computed at insert time by a keyword categoriser (V1 — simple,
-- deterministic, no AI). Null means uncategorised → shown under "Other".
-- ============================================================

alter table public.grocery_items add column category text;
