-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Lecteur (2026-08-11)
--
-- 1) Deux RPC SECURITY DEFINER sans contrôle réel, exécutables par `anon`
--    (la clé publishable est publique par conception, et HOUSEHOLD_ID est une
--    constante de build présente dans le bundle) :
--      - vote_lecteur_queue acceptait n'importe quel p_voter_key, y compris un
--        `g:` usurpant la dédup des invités, sur n'importe quel item ;
--      - sort_lecteur_queue_by_votes sautait son contrôle d'appartenance quand
--        auth.uid() IS NULL, échappatoire prévue pour une Edge Function qui ne
--        l'a jamais appelée.
--    La clé de vote est désormais calculée SERVEUR, et les droits d'exécution
--    sont retirés à anon.
--
-- 2) Verrou DJ : rien n'empêchait deux appareils de jouer la file en même temps
--    (double son, morceaux sautés par deux markPlayed concurrents).
--
-- 3) now_playing.updated_at était écrit par le client : l'anti-stale de 6 h de
--    l'edge dépendait de l'horloge de l'appareil DJ.
--
-- 4) Sortie de bibliothèque : un fichier peut être masqué aux invités de soirée.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Vote : clé calculée serveur + autorisation explicite ──────────────────

CREATE OR REPLACE FUNCTION public.vote_lecteur_queue(p_item_id uuid, p_voter_key text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role      text := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
  v_member    uuid;
  v_household uuid;
  v_key       text;
  v_count     int;
BEGIN
  -- Le morceau doit exister et ne pas être déjà joué.
  SELECT household_id INTO v_household
  FROM public.lecteur_queue WHERE id = p_item_id AND played = false;
  IF v_household IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    -- Membre : une voix par membre, sur son foyer uniquement. p_voter_key est
    -- ignoré — c'était le vecteur d'usurpation.
    SELECT id INTO v_member
    FROM public.members
    WHERE user_id = auth.uid() AND household_id = v_household;
    IF v_member IS NULL THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    v_key := 'm:' || v_member::text;
  ELSIF v_role = 'service_role' THEN
    -- Invité, via l'Edge Function jukebox (qui a validé le token de soirée).
    -- Elle seule peut poser une empreinte invité.
    IF p_voter_key IS NULL OR btrim(p_voter_key) = '' THEN
      RAISE EXCEPTION 'voter key required';
    END IF;
    v_key := 'g:' || left(regexp_replace(p_voter_key, '^g:', ''), 64);
  ELSE
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.vote_lecteur_queue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vote_lecteur_queue(uuid, text) TO authenticated, service_role;

-- ── 2. Tri par votes : contrôle d'appartenance inconditionnel ────────────────

CREATE OR REPLACE FUNCTION public.sort_lecteur_queue_by_votes(p_household uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_head_pos bigint;
  r record;
  i bigint := 1;
BEGIN
  -- Plus d'échappatoire pour auth.uid() NULL : aucune Edge Function n'appelle
  -- cette fonction, la porte n'était ouverte que pour un attaquant anonyme.
  IF NOT EXISTS (
    SELECT 1 FROM public.members WHERE user_id = auth.uid() AND household_id = p_household
  ) THEN
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

REVOKE ALL ON FUNCTION public.sort_lecteur_queue_by_votes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sort_lecteur_queue_by_votes(uuid) TO authenticated;

-- ── 3. Hygiène : search_path sur increment_media_play ────────────────────────

CREATE OR REPLACE FUNCTION public.increment_media_play(p_file_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.media_files SET play_count = play_count + 1 WHERE id = p_file_id;
$$;

-- ── 4. Token de soirée : WITH CHECK manquant sur UPDATE ──────────────────────

DROP POLICY IF EXISTS "party_tokens_update" ON public.lecteur_party_tokens;
CREATE POLICY "party_tokens_update" ON public.lecteur_party_tokens FOR UPDATE
  USING      (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()))
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- ── 5. now_playing : horodatage serveur ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_lecteur_now_playing()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lecteur_now_playing_touch ON public.lecteur_now_playing;
CREATE TRIGGER lecteur_now_playing_touch
  BEFORE INSERT OR UPDATE ON public.lecteur_now_playing
  FOR EACH ROW EXECUTE FUNCTION public.touch_lecteur_now_playing();

-- ── 6. Verrou DJ : un seul appareil joue la file à la fois ───────────────────
-- Table dédiée plutôt qu'une colonne de now_playing : ce sont deux durées de
-- vie différentes (le morceau change, le verrou tient toute la soirée).

CREATE TABLE IF NOT EXISTS public.lecteur_dj_lock (
  household_id uuid        PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  device_id    text        NOT NULL,
  member_id    uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lecteur_dj_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dj_lock_select" ON public.lecteur_dj_lock FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- Écriture réservée à la RPC (SECURITY DEFINER) : pas de policy INSERT/UPDATE.

/**
 * Prend ou renouvelle le verrou DJ. Renvoie true si cet appareil est DJ après
 * l'appel. Un verrou dont le heartbeat a plus de p_stale_seconds est considéré
 * abandonné (onglet fermé, crash) et peut être repris.
 * L'atomicité vient du ON CONFLICT : deux appareils qui démarrent en même temps
 * ne peuvent pas obtenir true tous les deux.
 */
CREATE OR REPLACE FUNCTION public.claim_lecteur_dj(
  p_household uuid, p_device text, p_stale_seconds int DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member uuid;
  v_got    boolean := false;
BEGIN
  SELECT id INTO v_member
  FROM public.members WHERE user_id = auth.uid() AND household_id = p_household;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_device IS NULL OR btrim(p_device) = '' THEN
    RAISE EXCEPTION 'device required';
  END IF;

  INSERT INTO public.lecteur_dj_lock (household_id, device_id, member_id, heartbeat_at)
  VALUES (p_household, p_device, v_member, now())
  ON CONFLICT (household_id) DO UPDATE
    SET device_id = excluded.device_id, member_id = excluded.member_id, heartbeat_at = now()
    WHERE lecteur_dj_lock.device_id = excluded.device_id
       OR lecteur_dj_lock.heartbeat_at < now() - make_interval(secs => p_stale_seconds)
  RETURNING true INTO v_got;

  RETURN coalesce(v_got, false);
END $$;

REVOKE ALL ON FUNCTION public.claim_lecteur_dj(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_lecteur_dj(uuid, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_lecteur_dj(p_household uuid, p_device text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.members WHERE user_id = auth.uid() AND household_id = p_household
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.lecteur_dj_lock
  WHERE household_id = p_household AND device_id = p_device;
END $$;

REVOKE ALL ON FUNCTION public.release_lecteur_dj(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_lecteur_dj(uuid, text) TO authenticated;

-- ── 7. Confidentialité : masquer un fichier aux invités de soirée ────────────
-- Opt-out (défaut false) pour ne rien changer aux bibliothèques existantes.

ALTER TABLE public.media_files
  ADD COLUMN IF NOT EXISTS party_hidden boolean NOT NULL DEFAULT false;

-- ── 8. Realtime + purge du verrou abandonné ─────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lecteur_dj_lock'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lecteur_dj_lock;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-lecteur-dj-lock',
      '29 4 * * *',
      $cron$ DELETE FROM public.lecteur_dj_lock WHERE heartbeat_at < now() - INTERVAL '1 day' $cron$
    );
  END IF;
END $$;
