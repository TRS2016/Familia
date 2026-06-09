-- position stocke Date.now() (epoch ms) comme clé d'ordre → dépasse int4.
-- Passage en bigint.
ALTER TABLE public.lecteur_queue ALTER COLUMN position TYPE bigint;
