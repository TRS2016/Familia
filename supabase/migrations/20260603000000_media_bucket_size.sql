-- Relève la limite de taille par fichier du bucket family-media (vidéos de démo)
-- 500 Mo. Note : sur le plan gratuit Supabase, la limite GLOBALE du projet
-- (Dashboard → Storage → Settings) plafonne à 50 Mo par fichier quoi qu'il
-- arrive — pour des vidéos plus lourdes il faut un plan payant, sinon
-- utiliser des clips courts (< 50 Mo) ou des liens YouTube.

UPDATE storage.buckets
SET file_size_limit = 524288000   -- 500 Mo
WHERE id = 'family-media';
