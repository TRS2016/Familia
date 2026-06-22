-- Moments : légende facultative par photo d'un album.
ALTER TABLE public.moment_photos ADD COLUMN IF NOT EXISTS caption text;
