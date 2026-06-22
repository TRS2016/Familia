-- Moments : vidéo courte (en plus du texte / de l'album photo).
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS video_path text;
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS video_mime text;

-- Autorise les vidéos courtes dans le bucket des moments. Note : sur le plan
-- gratuit Supabase, le plafond GLOBAL reste 50 Mo/fichier (clips courts).
UPDATE storage.buckets
SET file_size_limit = 524288000,        -- 500 Mo (plafonné à 50 Mo par le plan gratuit)
    allowed_mime_types = NULL           -- images + vidéos
WHERE id = 'family-moments';
