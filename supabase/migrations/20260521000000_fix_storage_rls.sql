-- Fix Storage RLS policies for plan-documents bucket
-- The previous policies failed for some users due to JWT/path issues.
-- New approach: allow authenticated users to upload to ANY path inside the bucket,
-- but SELECT/DELETE only files in their own folder.

DROP POLICY IF EXISTS "Users can upload plan documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their plan documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their plan documents" ON storage.objects;

-- INSERT: any authenticated user can upload into plan-documents
CREATE POLICY "Authenticated users can upload to plan-documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'plan-documents');

-- SELECT: user can read their own files OR admin can read all
CREATE POLICY "Users read own plan-documents or admins read all"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'plan-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
);

-- UPDATE: same as SELECT (for upsert)
CREATE POLICY "Users update own plan-documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'plan-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  )
);

-- DELETE: only own files
CREATE POLICY "Users delete own plan-documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'plan-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Increase bucket file size limit to 50MB (for large PDF plans)
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg']
WHERE id = 'plan-documents';
