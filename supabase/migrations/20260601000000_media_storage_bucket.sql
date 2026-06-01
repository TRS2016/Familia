-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket storage pour le Lecteur (fichiers audio/vidéo uploadés)
-- Chemin des fichiers : [household_id]/[member_id]/[uuid].[ext]
-- Bucket privé : l'app lit via createSignedUrl().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Bucket ────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('family-media', 'family-media', false)
ON CONFLICT (id) DO NOTHING;

-- ── Policies storage.objects ──────────────────────────────────────────────────
-- Même structure que family-moments : un membre du foyer peut uploader dans le
-- dossier de son foyer, lire tout le contenu de son foyer, et supprimer ses
-- propres fichiers.

DROP POLICY IF EXISTS "media_storage_upload" ON storage.objects;
CREATE POLICY "media_storage_upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'family-media' AND
  (storage.foldername(name))[1] = (SELECT household_id::text FROM members WHERE user_id = auth.uid()) AND
  (storage.foldername(name))[2] = (SELECT id::text FROM members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "media_storage_read" ON storage.objects;
CREATE POLICY "media_storage_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'family-media' AND
  (storage.foldername(name))[1] IN (SELECT household_id::text FROM members WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "media_storage_delete" ON storage.objects;
CREATE POLICY "media_storage_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'family-media' AND
  (storage.foldername(name))[2] = (SELECT id::text FROM members WHERE user_id = auth.uid())
);
