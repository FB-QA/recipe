-- ============================================================
-- Let the background import enrichment persist a recipe's thumbnail path.
-- The deferred cover enrichment runs as service_role (off the request path). When it
-- re-stores a cover it also writes thumb.webp, and must record thumb_image_path — else a
-- recipe whose save-time thumb upload failed keeps serving the full cover on the shelf.
-- Column-level, deliberately: service_role may set ONLY the derived thumbnail path (and
-- read the id to target the row), never user content. Additive and idempotent.
-- ============================================================

grant select (id), update (thumb_image_path) on public.recipes to service_role;
