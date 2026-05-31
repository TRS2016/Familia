-- Objectif d'épargne individuel par membre
ALTER TABLE members ADD COLUMN IF NOT EXISTS kakebo_objectif_epargne NUMERIC(10,2);
