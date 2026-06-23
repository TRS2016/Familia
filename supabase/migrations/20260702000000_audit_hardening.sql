-- ─────────────────────────────────────────────────────────────────────────────
-- Durcissements issus de l'audit transversal des features.
-- 1) vote_lecteur_queue : empêche le vote stuffing (voter_key client-contrôlé) et
--    vérifie l'appartenance au foyer pour les membres connectés.
-- 2) resolve_redemption : filtre explicitement le household (défense en profondeur,
--    en plus de la RLS).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Vote lecteur : pour un membre connecté, la clé de vote est dérivée de son
--    auth.uid() (on ignore l'argument client → 1 voix/membre/morceau, non
--    falsifiable). Les invités passent par l'Edge Function (service role,
--    auth.uid() NULL) et conservent leur empreinte locale.
CREATE OR REPLACE FUNCTION public.vote_lecteur_queue(p_item_id uuid, p_voter_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_uid   uuid := auth.uid();
  v_key   text;
  v_hh    uuid;
BEGIN
  -- Membre connecté : vérifie l'appartenance au foyer du morceau + clé serveur.
  IF v_uid IS NOT NULL THEN
    SELECT q.household_id INTO v_hh FROM public.lecteur_queue q WHERE q.id = p_item_id;
    IF v_hh IS NULL THEN
      RETURN false;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = v_uid AND m.household_id = v_hh
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    v_key := 'member:' || v_uid::text;
  ELSE
    -- Invité (Edge Function service role) : empreinte locale fournie.
    v_key := 'guest:' || coalesce(p_voter_key, '');
  END IF;

  INSERT INTO public.lecteur_queue_votes (queue_item_id, voter_key)
  VALUES (p_item_id, v_key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    UPDATE public.lecteur_queue SET votes = votes + 1 WHERE id = p_item_id;
    RETURN true;
  END IF;
  RETURN false;
END $$;

-- 2) resolve_redemption : restreint l'UPDATE au foyer de l'appelant.
CREATE OR REPLACE FUNCTION public.resolve_redemption(p_redemption_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('approved', 'fulfilled', 'declined') THEN
    RAISE EXCEPTION 'statut invalide: %', p_status;
  END IF;
  UPDATE reward_redemptions
     SET status = p_status, resolved_at = now()
   WHERE id = p_redemption_id
     AND household_id = get_my_household_id();
END $$;
