-- ─────────────────────────────────────────────────────────────────────────────
-- Mode DJ : modération des demandes invitées. Quand elle est active, un morceau
-- demandé par un invité entre en « attente » ; le DJ valide ou refuse avant
-- l'entrée en file. Les membres du foyer ajoutent toujours en direct (approuvé).
-- ─────────────────────────────────────────────────────────────────────────────

-- approved=false → demande en attente. Défaut true → tout l'existant reste en file.
ALTER TABLE public.lecteur_queue ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;

-- Interrupteur de modération porté par le token de soirée (lu par l'Edge Function).
ALTER TABLE public.lecteur_party_tokens ADD COLUMN IF NOT EXISTS moderated boolean NOT NULL DEFAULT false;

-- Le DJ (membre du foyer) bascule la modération → policy UPDATE sur le token.
CREATE POLICY "party_tokens_update" ON public.lecteur_party_tokens FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS lecteur_queue_pending_idx
  ON public.lecteur_queue(household_id, approved, played);
