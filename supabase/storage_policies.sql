-- Storage RLS Policies for ParlEcho
-- Run in Supabase Dashboard → SQL Editor
-- Idempotent: có thể chạy lại nhiều lần

-- ──────────────────────────────────────────────────────────────────────
-- 1. Create buckets (idempotent)
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('recordings', 'recordings', false, 10485760,
   ARRAY['audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/wav', 'audio/webm']),
  ('tts',        'tts',        true,  5242880,
   ARRAY['audio/wav', 'audio/mpeg', 'audio/mp4']),
  ('exploration-images', 'exploration-images', true, 5242880,
   ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Drop existing policies (để chạy lại không bị lỗi "already exists")
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recordings: users upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "recordings: users read own files"       ON storage.objects;
DROP POLICY IF EXISTS "recordings: users delete own files"     ON storage.objects;
DROP POLICY IF EXISTS "tts: public read"                       ON storage.objects;
DROP POLICY IF EXISTS "exploration-images: public read"        ON storage.objects;

-- ──────────────────────────────────────────────────────────────────────
-- 3. recordings bucket policies
--    Path: {user_id}/{filename}  →  split_part(name,'/',1) = user_id
-- ──────────────────────────────────────────────────────────────────────

CREATE POLICY "recordings: users upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recordings'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "recordings: users read own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recordings'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "recordings: users delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recordings'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- ──────────────────────────────────────────────────────────────────────
-- 4. tts bucket — public read, service_role-only write (bypasses RLS)
-- ──────────────────────────────────────────────────────────────────────

CREATE POLICY "tts: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'tts');

-- ──────────────────────────────────────────────────────────────────────
-- 5. exploration-images bucket — public read, service_role-only write
--    (Pha 5: ảnh duyệt bởi image-moderation; Pha 6 sẽ thêm policy upload
--    cho phụ huynh)
-- ──────────────────────────────────────────────────────────────────────

CREATE POLICY "exploration-images: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'exploration-images');
