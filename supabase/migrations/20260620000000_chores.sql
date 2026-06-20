-- ─────────────────────────────────────────────────────────────────────────────
-- Chores feature (Lot 1) — tâches familiales partagées + assignation/rotation
-- + log « fait par qui/quand » + ledger de points (point_events).
--
-- Distinct des habits (personnelles, do/avoid). Ici : corvées du foyer, qui
-- cuisine / récupère les enfants / etc. Octroi de points centralisé dans la
-- RPC log_chore (anti double-crédit). point_events est créé dès ce lot car
-- log_chore l'alimente (la gamification visible arrive au Lot 2).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Templates de tâche du foyer.
CREATE TABLE public.chores (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  emoji              text        NOT NULL DEFAULT '🧹',
  color              text,
  category           text        NOT NULL DEFAULT 'autre',
  points             smallint    NOT NULL DEFAULT 10,
  frequency          text        NOT NULL DEFAULT 'daily', -- daily | weekly | none (ad-hoc)
  frequency_days     int[],                                -- 1=lun…7=dim, null = tous les jours prévus
  start_date         date,
  rotation_member_ids uuid[],                              -- null = pas de rotation
  rotation_period    text        NOT NULL DEFAULT 'week',  -- 'week' | 'day'
  default_member_id  uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  position           int,
  archived_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Planning : qui est censé faire quoi, quel jour (matérialisé depuis la rotation).
CREATE TABLE public.chore_assignments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  chore_id     uuid        NOT NULL REFERENCES public.chores(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  date         date        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending', -- pending | done | skipped
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chore_id, date)
);

-- Déclarations « fait ». chore_id/assignment_id nullables pour le mode ad-hoc.
CREATE TABLE public.chore_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  chore_id       uuid        REFERENCES public.chores(id) ON DELETE SET NULL,
  assignment_id  uuid        REFERENCES public.chore_assignments(id) ON DELETE SET NULL,
  member_id      uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  done_on        date        NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Paris')::date,
  label          text,                                -- libellé libre pour une tâche ad-hoc sans template
  points_awarded smallint    NOT NULL DEFAULT 0,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Ledger de points (source de vérité du score). Immuable en usage normal :
-- on insère un événement positif à chaque tâche, on supprime au undo.
CREATE TABLE public.point_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  points       int         NOT NULL,
  reason       text        NOT NULL DEFAULT 'chore', -- chore | badge | bonus | adjust | reward
  ref_type     text,                                 -- 'chore_log' | 'achievement' | 'redemption' | …
  ref_id       uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX chores_household_idx            ON public.chores(household_id);
CREATE INDEX chore_assignments_household_idx ON public.chore_assignments(household_id);
CREATE INDEX chore_assignments_date_idx      ON public.chore_assignments(date DESC);
CREATE INDEX chore_logs_household_idx        ON public.chore_logs(household_id);
CREATE INDEX chore_logs_done_on_idx          ON public.chore_logs(done_on DESC);
CREATE INDEX chore_logs_member_idx           ON public.chore_logs(member_id);
CREATE INDEX point_events_household_idx      ON public.point_events(household_id);
CREATE INDEX point_events_member_idx         ON public.point_events(member_id);
CREATE INDEX point_events_created_idx        ON public.point_events(created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.chores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chore_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_events      ENABLE ROW LEVEL SECURITY;

-- chores
CREATE POLICY "chores_select" ON public.chores FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chores_insert" ON public.chores FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chores_update" ON public.chores FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chores_delete" ON public.chores FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- chore_assignments
CREATE POLICY "chore_assignments_select" ON public.chore_assignments FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_assignments_insert" ON public.chore_assignments FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_assignments_update" ON public.chore_assignments FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_assignments_delete" ON public.chore_assignments FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- chore_logs
CREATE POLICY "chore_logs_select" ON public.chore_logs FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_logs_insert" ON public.chore_logs FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_logs_update" ON public.chore_logs FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "chore_logs_delete" ON public.chore_logs FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- point_events (lecture foyer ; écritures via RPC SECURITY INVOKER, donc INSERT/DELETE
-- autorisés au foyer mais le client passe toujours par log_chore/undo_chore_log)
CREATE POLICY "point_events_select" ON public.point_events FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "point_events_insert" ON public.point_events FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "point_events_delete" ON public.point_events FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- ── RPC (SECURITY INVOKER : la RLS s'applique, corps transactionnel) ───────────

-- Déclare une tâche faite : crée le chore_logs, crédite les points (point_events),
-- passe l'assignment à 'done'. Idempotent sur assignment_id (si déjà done, ne
-- re-crédite pas). Retourne l'id du log créé (ou existant).
CREATE OR REPLACE FUNCTION public.log_chore(
  p_chore_id      uuid,
  p_assignment_id uuid,
  p_member_id     uuid,
  p_done_on       date,
  p_label         text,
  p_note          text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  hh        uuid;
  v_points  smallint := 0;
  v_log_id  uuid;
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
    SELECT points INTO v_points FROM chores WHERE id = p_chore_id;
    v_points := coalesce(v_points, 0);
  END IF;

  INSERT INTO chore_logs (household_id, chore_id, assignment_id, member_id, done_on, label, points_awarded, note)
  VALUES (hh, p_chore_id, p_assignment_id, p_member_id,
          coalesce(p_done_on, (now() AT TIME ZONE 'Europe/Paris')::date),
          nullif(trim(p_label), ''), v_points, nullif(trim(p_note), ''))
  RETURNING id INTO v_log_id;

  IF v_points <> 0 THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, v_points, 'chore', 'chore_log', v_log_id);
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'done' WHERE id = p_assignment_id;
  END IF;

  RETURN v_log_id;
END;
$$;

-- Annule un pointage : supprime le log, son point_event, repasse l'assignment à pending.
CREATE OR REPLACE FUNCTION public.undo_chore_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_assignment uuid;
BEGIN
  SELECT assignment_id INTO v_assignment FROM chore_logs WHERE id = p_log_id;

  DELETE FROM point_events WHERE ref_type = 'chore_log' AND ref_id = p_log_id;
  DELETE FROM chore_logs WHERE id = p_log_id;

  IF v_assignment IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'pending' WHERE id = v_assignment;
  END IF;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.chores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chore_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chore_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.point_events;
