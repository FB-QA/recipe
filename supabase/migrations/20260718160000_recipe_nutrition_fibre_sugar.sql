-- ============================================================
-- 0009 — fibre + sugar on recipes
-- Emily English-style captions lead with fibre ("330 kcal, 10g fibre"); the
-- initial nutrition set (0008) missed it. Additive text columns, as before.
-- ============================================================
alter table public.recipes
  add column fibre text,
  add column sugar text;
