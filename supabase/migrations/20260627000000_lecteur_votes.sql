-- ─────────────────────────────────────────────────────────────────────────────
-- Mode DJ : vote des invités/membres pour signaler les morceaux populaires.
-- Modèle « le DJ arbitre » : le vote incrémente un compteur ; le DJ range la
-- file par votes d'un tap. AUCUN réordonnancement automatique (le morceau en
-- cours ne saute jamais).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lecteur_queue ADD COLUMN IF NOT EXISTS votes int NOT NULL DEFAULT 0;

-- Dédup : une voix par votant. Membre → member_id ; invité → empreinte locale.
CREATE TABLE IF NOT EXISTS public.lecteur_queue_votes (
  queue_item_id uuid NOT NULL REFERENCES public.lecteur_queue(id) ON DELETE CASCADE,
  voter_key     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue_item_id, voter_key)
);

ALTER TABLE public.lecteur_queue_votes ENABLE ROW LEVEL SECURITY;
-- Membres du foyer uniquement ; les invités votent via l'Edge Function (service role).
CREATE POLICY "lqv_select" ON public.lecteur_queue_votes FOR SELECT
  USING (queue_item_id IN (
    SELECT id FROM public.lecteur_queue
    WHERE household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())));
CREATE POLICY "lqv_insert" ON public.lecteur_queue_votes FOR INSERT
  WITH CHECK (queue_item_id IN (
    SELECT id FROM public.lecteur_queue
    WHERE household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())));

-- Vote atomique idempotent : pose la voix puis incrémente le compteur si nouvelle.
-- SECURITY DEFINER → sert membres (RLS) et Edge Function de façon identique.
CREATE OR REPLACE FUNCTION public.vote_lecteur_queue(p_item_id uuid, p_voter_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  INSERT INTO public.lecteur_queue_votes (queue_item_id, voter_key)
  VALUES (p_item_id, p_voter_key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    UPDATE public.lecteur_queue SET votes = votes + 1 WHERE id = p_item_id;
    RETURN true;
  END IF;
  RETURN false;
END $$;

-- Range la file non jouée par votes décroissants en GARDANT le morceau en tête
-- (en cours) à sa place : on ne réassigne que les positions des suivants.
CREATE OR REPLACE FUNCTION public.sort_lecteur_queue_by_votes(p_household uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_head_pos bigint;
  r record;
  i bigint := 1;
BEGIN
  -- Appel membre : vérifie l'appartenance au foyer. (Edge Function : auth.uid() NULL.)
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND household_id = p_household) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT position INTO v_head_pos
  FROM public.lecteur_queue
  WHERE household_id = p_household AND played = false
  ORDER BY position ASC
  LIMIT 1;
  IF v_head_pos IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT id FROM public.lecteur_queue
    WHERE household_id = p_household AND played = false AND position <> v_head_pos
    ORDER BY votes DESC, position ASC
  LOOP
    UPDATE public.lecteur_queue SET position = v_head_pos + i WHERE id = r.id;
    i := i + 1;
  END LOOP;
END $$;
