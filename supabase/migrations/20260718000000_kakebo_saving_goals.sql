-- ─────────────────────────────────────────────────────────────────────────────
-- Projets d'épargne (enveloppes) : objectifs nommés (« Vacances », « Travaux »)
-- alimentés par les opérations des catégories de type 'saving'. La progression
-- d'un projet = somme des opérations qui lui sont rattachées (saving_goal_id).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.kakebo_saving_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  emoji         text        NOT NULL DEFAULT '🎯',
  target_amount numeric     NOT NULL CHECK (target_amount > 0),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kakebo_saving_goals_household_idx ON public.kakebo_saving_goals(household_id);

ALTER TABLE public.kakebo_saving_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kakebo_saving_goals_select" ON public.kakebo_saving_goals FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "kakebo_saving_goals_insert" ON public.kakebo_saving_goals FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "kakebo_saving_goals_update" ON public.kakebo_saving_goals FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "kakebo_saving_goals_delete" ON public.kakebo_saving_goals FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.kakebo_saving_goals;

-- Rattachement optionnel d'une opération à un projet.
ALTER TABLE public.kakebo_entries
  ADD COLUMN saving_goal_id uuid REFERENCES public.kakebo_saving_goals(id) ON DELETE SET NULL;

CREATE INDEX kakebo_entries_saving_goal_idx
  ON public.kakebo_entries(saving_goal_id) WHERE saving_goal_id IS NOT NULL;
