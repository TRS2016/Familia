-- ─────────────────────────────────────────────────────────────────────────────
-- Chores feature (Lot 2) — moteur de jeu : badges débloqués + objectif familial.
-- Le ledger point_events existe déjà (Lot 1). Les niveaux/XP sont dérivés en
-- code (pas de table). Catalogue de badges statique côté code ; ici on ne
-- stocke que les badges effectivement débloqués.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Badges débloqués par membre (clé du badge définie côté code, idempotent).
CREATE TABLE public.member_achievements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id       uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  achievement_key text        NOT NULL,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, achievement_key)
);

-- Objectif/cagnotte familiale commune. La progression est calculée côté client
-- (somme des point_events du foyer sur la période courante).
CREATE TABLE public.family_goals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  target_points int        NOT NULL,
  reward_text  text,
  period       text        NOT NULL DEFAULT 'week', -- week | month | open
  period_start date        NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Paris')::date,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX member_achievements_household_idx ON public.member_achievements(household_id);
CREATE INDEX member_achievements_member_idx    ON public.member_achievements(member_id);
CREATE INDEX family_goals_household_idx        ON public.family_goals(household_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.member_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_goals        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_achievements_select" ON public.member_achievements FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "member_achievements_insert" ON public.member_achievements FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "member_achievements_delete" ON public.member_achievements FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "family_goals_select" ON public.family_goals FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "family_goals_insert" ON public.family_goals FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "family_goals_update" ON public.family_goals FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "family_goals_delete" ON public.family_goals FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.member_achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.family_goals;
