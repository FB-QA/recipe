-- ============================================================
-- 0003 — recipe image storage
-- Private bucket. Objects live at  {user_id}/{recipe_id}/{file}.
-- The app serves them via short-lived signed URLs, so images are never
-- publicly reachable — RLS restricts every operation to the owner's folder.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  5242880, -- 5 MB ceiling; the app compresses well below this before upload
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "recipe-images: owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recipe-images: owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recipe-images: owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "recipe-images: owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
