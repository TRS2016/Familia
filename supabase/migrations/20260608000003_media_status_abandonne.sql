-- Ajoute le statut « abandonné » (série lâchée, livre non terminé).
ALTER TABLE public.media_items DROP CONSTRAINT IF EXISTS media_items_status_check;
ALTER TABLE public.media_items ADD CONSTRAINT media_items_status_check
  CHECK (status IN ('à voir', 'en cours', 'terminé', 'abandonné'));
