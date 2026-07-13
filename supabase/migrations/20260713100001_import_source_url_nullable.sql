-- ============================================================
-- 0008 — allow imports with no URL (pasted text)
-- Pasting raw recipe text has no source URL, but we still record the attempt
-- for cost tracking + the daily rate limit.
-- ============================================================

alter table public.recipe_imports alter column source_url drop not null;
