-- Token iCal par membre, révocable individuellement (remplace le secret partagé
-- inliné dans le bundle client). Chaque membre a son propre lien d'abonnement.
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS ical_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS members_ical_token_uniq
  ON public.members (ical_token);
