-- ============================================================
-- 0007 — pricing seeds for gemini-3.1-flash-lite
-- gemini-2.5-flash-lite (spec §16) is closed to new API keys; 3.1-flash-lite is
-- the current flash-lite and the spec's named replacement (§3.4/§29). Seed its
-- prices so AI-extraction + URL-context costs are metered, not 'none'.
--
-- Rates carried over from the spec §16 flash-lite family ($0.10/1M text·image·
-- video input, $0.30/1M audio, $0.40/1M output) as integer nano-USD per token.
-- Operator-adjustable per §23 — update here if 3.1 rates differ.
-- Idempotent via WHERE NOT EXISTS (partial unique index can't back ON CONFLICT).
-- ============================================================
insert into public.external_service_pricing
  (provider_id, service_id, model_id, unit_type, price_per_unit_nano_usd)
select v.provider_id, v.service_id, v.model_id, v.unit_type, v.price
from (values
  ('google', 'messages',    'gemini-3.1-flash-lite', 'input_token',        100::bigint),
  ('google', 'messages',    'gemini-3.1-flash-lite', 'image_input_token',  100::bigint),
  ('google', 'messages',    'gemini-3.1-flash-lite', 'video_input_token',  100::bigint),
  ('google', 'messages',    'gemini-3.1-flash-lite', 'audio_input_token',  300::bigint),
  ('google', 'messages',    'gemini-3.1-flash-lite', 'output_token',       400::bigint),
  ('google', 'url_context', 'gemini-3.1-flash-lite', 'input_token',        100::bigint),
  ('google', 'url_context', 'gemini-3.1-flash-lite', 'output_token',       400::bigint)
) as v(provider_id, service_id, model_id, unit_type, price)
where not exists (
  select 1 from public.external_service_pricing p
  where p.provider_id = v.provider_id
    and p.service_id  = v.service_id
    and p.model_id    = v.model_id
    and p.unit_type   = v.unit_type
    and p.effective_to is null
);
