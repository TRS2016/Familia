-- ─────────────────────────────────────────────────────────────────────────────
-- Volet « Équilibre du foyer » (feature Tâches, pensé pour 2 adultes).
-- Philosophie : maintenir un équilibre, pas désigner un gagnant. Tout se
-- calcule sur le MÊME ledger point_events (aucune double comptabilité).
--
-- 1) chores.mental_load + chore_logs.mental_load : tag « charge mentale »
--    transversal (en plus de la catégorie), snapshotté sur le log au pointage
--    pour que les stats survivent à la suppression du template.
-- 2) chore_thanks : « merci » sur une tâche faite par l'autre. Symbolique
--    (0 point), un par tâche et par personne (UNIQUE), NON annulable → RLS
--    sans policy DELETE ni UPDATE. log_id ON DELETE SET NULL : le compteur
--    de mercis survit à l'annulation du pointage et à la suppression du
--    template (les logs survivent déjà à celle-ci).
-- 3) chore_dislikes : tâches détestées, marquage par membre, visible du foyer.
-- 4) chore_feedback : recalibrage de pénibilité (« c'était comment ? »),
--    accumulé sur la tâche, survit aux suppressions (SET NULL). La décision
--    d'ajuster les points reste humaine (l'app ne fait que suggérer).
-- 5) log_chore : snapshot mental_load + bonus « tâche détestée » (+50 % des
--    points, arrondi) si la tâche est détestée par quelqu'un d'autre ET pas
--    par celui qui la fait — évalué au moment du pointage, via le canal
--    unique point_events (ref_type 'dislike_bonus', ref_id = log).
-- 6) undo_chore_log : reprend aussi le bonus « tâche détestée ».
-- 7) member_points_by_week : sommes hebdomadaires (lundi, heure de Paris)
--    pour la balance d'équité et le streak de couple, sans charger l'historique.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Charge mentale ─────────────────────────────────────────────────────────

ALTER TABLE public.chores     ADD COLUMN IF NOT EXISTS mental_load boolean NOT NULL DEFAULT false;
ALTER TABLE public.chore_logs ADD COLUMN IF NOT EXISTS mental_load boolean NOT NULL DEFAULT false;

-- ── 2) Mercis ─────────────────────────────────────────────────────────────────

CREATE TABLE public.chore_thanks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  log_id       uuid        REFERENCES public.chore_logs(id) ON DELETE SET NULL,
  from_member  uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  to_member    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (from_member <> to_member),
  UNIQUE (log_id, from_member)
);

CREATE INDEX chore_thanks_household_idx ON public.chore_thanks(household_id);
CREATE INDEX chore_thanks_to_idx        ON public.chore_thanks(to_member);

ALTER TABLE public.chore_thanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chore_thanks_select" ON public.chore_thanks FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
-- Insert restreint au foyer ET à soi-même comme émetteur (pas de merci forgé).
CREATE POLICY "chore_thanks_insert" ON public.chore_thanks FOR INSERT
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
    AND from_member IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );
-- Pas de policy UPDATE/DELETE : un merci est non annulable.

-- ── 3) Tâches détestées ───────────────────────────────────────────────────────

CREATE TABLE public.chore_dislikes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  chore_id     uuid        NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  member_id    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chore_id, member_id)
);

CREATE INDEX chore_dislikes_household_idx ON public.chore_dislikes(household_id);
CREATE INDEX chore_dislikes_chore_idx     ON public.chore_dislikes(chore_id);

ALTER TABLE public.chore_dislikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chore_dislikes_select" ON public.chore_dislikes FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
-- On ne marque/démarque que ses propres détestations.
CREATE POLICY "chore_dislikes_insert" ON public.chore_dislikes FOR INSERT
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
    AND member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );
CREATE POLICY "chore_dislikes_delete" ON public.chore_dislikes FOR DELETE
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- ── 4) Recalibrage de pénibilité ──────────────────────────────────────────────

CREATE TABLE public.chore_feedback (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  chore_id     uuid        REFERENCES public.chores(id) ON DELETE SET NULL,
  log_id       uuid        REFERENCES public.chore_logs(id) ON DELETE SET NULL,
  member_id    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  verdict      text        NOT NULL CHECK (verdict IN ('easier', 'as_expected', 'harder')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chore_feedback_household_idx ON public.chore_feedback(household_id);
CREATE INDEX chore_feedback_chore_idx     ON public.chore_feedback(chore_id);

ALTER TABLE public.chore_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chore_feedback_select" ON public.chore_feedback FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_feedback_insert" ON public.chore_feedback FOR INSERT
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
    AND member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
  );
-- Pas d'UPDATE/DELETE : les réponses s'accumulent, elles ne se réécrivent pas.

-- ── 7) Sommes hebdomadaires (balance + streak de couple) ──────────────────────
-- date_trunc('week') = lundi (ISO). Converti en heure de Paris pour que les
-- semaines suivent le fuseau du foyer.

CREATE OR REPLACE FUNCTION public.member_points_by_week(p_since date)
RETURNS TABLE(week_start date, member_id uuid, total bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT (date_trunc('week', (created_at AT TIME ZONE 'Europe/Paris'))::date) AS week_start,
         member_id,
         sum(points)::bigint
  FROM point_events
  WHERE (created_at AT TIME ZONE 'Europe/Paris')::date >= p_since
  GROUP BY 1, 2;
$$;

-- ── 5) log_chore : snapshot mental_load + bonus « tâche détestée » ────────────

CREATE OR REPLACE FUNCTION public.log_chore(
  p_chore_id      uuid,
  p_assignment_id uuid,
  p_member_id     uuid,
  p_done_on       date,
  p_label         text,
  p_note          text,
  p_points        int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  hh         uuid;
  v_points   int := 0;
  v_log_id   uuid;
  v_category text;
  v_mental   boolean := false;
  v_bonus    int;
  v_today    date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_day      date;
  v_streak   int := 0;
BEGIN
  hh := get_my_household_id();

  -- Anti-rejeu : si l'assignment a déjà un log, on le renvoie sans re-créditer.
  IF p_assignment_id IS NOT NULL THEN
    SELECT id INTO v_log_id FROM chore_logs WHERE assignment_id = p_assignment_id LIMIT 1;
    IF v_log_id IS NOT NULL THEN
      RETURN v_log_id;
    END IF;
  END IF;

  IF p_chore_id IS NOT NULL THEN
    SELECT points, category, mental_load INTO v_points, v_category, v_mental FROM chores WHERE id = p_chore_id;
    v_points := coalesce(v_points, 0);
    v_mental := coalesce(v_mental, false);
  ELSE
    -- Tâche ad-hoc libre : montant fourni par l'appelant (sinon 0).
    v_points := coalesce(p_points, 0);
  END IF;

  BEGIN
    INSERT INTO chore_logs (household_id, chore_id, assignment_id, member_id, done_on, label, points_awarded, note, category, mental_load)
    VALUES (hh, p_chore_id, p_assignment_id, p_member_id,
            coalesce(p_done_on, v_today),
            nullif(trim(p_label), ''), v_points, nullif(trim(p_note), ''), v_category, v_mental)
    RETURNING id INTO v_log_id;
  EXCEPTION WHEN unique_violation THEN
    -- Course entre deux appareils (index 20260712) : renvoie le log gagnant.
    SELECT id INTO v_log_id FROM chore_logs WHERE assignment_id = p_assignment_id LIMIT 1;
    RETURN v_log_id;
  END;

  IF v_points <> 0 THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, v_points, 'chore', 'chore_log', v_log_id);
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'done' WHERE id = p_assignment_id;
  END IF;

  -- Bonus « tâche détestée » : +50 % des points si la tâche est détestée par
  -- quelqu'un d'autre ET pas par celui qui la fait (détestée par les deux =
  -- pas de bonus). Évalué au moment du pointage ; repris par undo_chore_log.
  IF p_chore_id IS NOT NULL AND v_points > 0 THEN
    IF EXISTS (SELECT 1 FROM chore_dislikes WHERE chore_id = p_chore_id AND member_id <> p_member_id)
       AND NOT EXISTS (SELECT 1 FROM chore_dislikes WHERE chore_id = p_chore_id AND member_id = p_member_id)
    THEN
      v_bonus := round(v_points * 0.5);
      IF v_bonus > 0 THEN
        INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
        VALUES (hh, p_member_id, v_bonus, 'bonus', 'dislike_bonus', v_log_id);
      END IF;
    END IF;
  END IF;

  -- Bonus de série : +10 à chaque palier de 7 jours d'affilée (7, 14, 21…).
  -- Advisory lock par membre = pas de double bonus en concurrence ; dédup un
  -- bonus par membre et par jour Paris ; ref_id = log déclencheur pour que
  -- undo_chore_log reprenne le bonus avec le pointage.
  PERFORM pg_advisory_xact_lock(hashtext('streak:' || p_member_id::text));
  v_day := v_today;
  IF NOT EXISTS (SELECT 1 FROM chore_logs WHERE member_id = p_member_id AND done_on = v_day) THEN
    v_day := v_day - 1; -- rien aujourd'hui : la série court encore depuis hier
  END IF;
  WHILE v_streak < 400 AND EXISTS (
    SELECT 1 FROM chore_logs WHERE member_id = p_member_id AND done_on = v_day
  ) LOOP
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  END LOOP;

  IF v_streak >= 7 AND v_streak % 7 = 0 AND NOT EXISTS (
    SELECT 1 FROM point_events
    WHERE member_id = p_member_id
      AND ref_type = 'streak_bonus'
      AND (created_at AT TIME ZONE 'Europe/Paris')::date = v_today
  ) THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, 10, 'bonus', 'streak_bonus', v_log_id);
  END IF;

  RETURN v_log_id;
END;
$$;

-- ── 6) undo_chore_log : reprend les bonus liés (série + tâche détestée) ───────

CREATE OR REPLACE FUNCTION public.undo_chore_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_assignment uuid;
BEGIN
  SELECT assignment_id INTO v_assignment FROM chore_logs WHERE id = p_log_id;

  DELETE FROM point_events WHERE ref_id = p_log_id AND ref_type IN ('chore_log', 'streak_bonus', 'dislike_bonus');
  DELETE FROM chore_logs WHERE id = p_log_id;

  IF v_assignment IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'pending' WHERE id = v_assignment;
  END IF;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.chore_thanks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chore_dislikes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chore_feedback;
