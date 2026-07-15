-- ============================================================
-- 0006 — exemption notes: bounded and revisable
-- From PR #14 review. A length ceiling on the note (operator-only table,
-- but bounded is bounded), and an update grant so the operator can revise
-- a note without delete+reinsert. Mirrors exactly the delta already run
-- against production on 2026-07-15.
-- ============================================================

alter table public.import_limit_exemptions
  add constraint import_limit_exemptions_note_length check (char_length(note) <= 500);

grant update on public.import_limit_exemptions to service_role;
