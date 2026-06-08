-- Les notes/commentaires sont désormais par membre (table media_ratings, où les
-- valeurs existantes ont été migrées). On retire les colonnes legacy devenues
-- inutilisées sur media_items.
ALTER TABLE public.media_items DROP COLUMN IF EXISTS rating;
ALTER TABLE public.media_items DROP COLUMN IF EXISTS comment;
