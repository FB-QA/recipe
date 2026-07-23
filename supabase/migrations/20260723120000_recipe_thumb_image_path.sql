-- ============================================================
-- recipe shelf thumbnails
-- A second, smaller WebP rendition (~500px) lives beside each cover so the shelf
-- grid serves a lightweight image instead of the full detail-hero cover. The path
-- is nullable: existing recipes have no thumb until re-saved or backfilled, and the
-- shelf falls back to `cover_image_path` in that case — never a broken image.
-- Additive and backward-compatible; safe to apply ahead of the code deploy.
-- ============================================================

alter table public.recipes
  add column if not exists thumb_image_path text;
