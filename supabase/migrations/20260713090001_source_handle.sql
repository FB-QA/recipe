-- ============================================================
-- 0006 — remember who a recipe was imported from
-- e.g. the Instagram creator's handle (ownerUsername), shown on the card
-- and detail as provenance instead of a bare "Instagram".
-- ============================================================

alter table public.recipes add column source_handle text;
