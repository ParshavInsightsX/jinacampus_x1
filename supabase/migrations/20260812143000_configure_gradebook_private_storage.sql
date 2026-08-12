-- GradeBook files are accessed only by server-side JinaCampus code through the
-- Supabase service role. No anon/authenticated storage.objects policy is added:
-- RLS therefore denies direct browser access by default.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'gradebook-private',
  'gradebook-private',
  false,
  10000000,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%gradebook-private%'
        OR COALESCE(with_check, '') ILIKE '%gradebook-private%'
      )
      AND (
        'public' = ANY(roles)
        OR 'anon' = ANY(roles)
        OR 'authenticated' = ANY(roles)
      )
  ) THEN
    RAISE EXCEPTION 'gradebook-private must not have direct browser-role storage policies';
  END IF;
END
$$;
