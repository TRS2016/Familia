-- Mode soirée : lien invité pour la file d'attente du Lecteur.
-- Token court partageable (QR/lien) permettant à des non-membres d'ajouter des
-- morceaux à la file via une Edge Function (jamais d'accès direct à la base).
CREATE TABLE public.lecteur_party_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text NOT NULL UNIQUE
               DEFAULT substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES public.members(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL DEFAULT (now() + INTERVAL '1 day'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lecteur_party_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "party_tokens_select" ON public.lecteur_party_tokens FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "party_tokens_insert" ON public.lecteur_party_tokens FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "party_tokens_delete" ON public.lecteur_party_tokens FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- Nom libre de l'invité ayant demandé le morceau (quand added_by est NULL).
ALTER TABLE public.lecteur_queue ADD COLUMN guest_name text;
