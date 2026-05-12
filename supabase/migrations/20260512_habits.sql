-- ─────────────────────────────────────────────────────────────────────────────
-- Habits feature — habit tracking per member
-- Apply manually via Supabase SQL editor (Dashboard → SQL editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.habits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  name         text        NOT NULL,
  emoji        text        NOT NULL DEFAULT '⭐',
  color        text,
  frequency    text        NOT NULL DEFAULT 'daily',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.habit_completions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id   uuid        NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  completed  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX habits_household_idx           ON public.habits(household_id);
CREATE INDEX habit_completions_habit_idx    ON public.habit_completions(habit_id);
CREATE INDEX habit_completions_date_idx     ON public.habit_completions(date DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.habits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;

-- habits
CREATE POLICY "habits_select"
  ON public.habits FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "habits_insert"
  ON public.habits FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "habits_update"
  ON public.habits FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "habits_delete"
  ON public.habits FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- habit_completions (via habit's household_id)
CREATE POLICY "habit_completions_select"
  ON public.habit_completions FOR SELECT
  USING (habit_id IN (SELECT id FROM public.habits WHERE household_id IN (
    SELECT household_id FROM public.members WHERE user_id = auth.uid()
  )));

CREATE POLICY "habit_completions_insert"
  ON public.habit_completions FOR INSERT
  WITH CHECK (habit_id IN (SELECT id FROM public.habits WHERE household_id IN (
    SELECT household_id FROM public.members WHERE user_id = auth.uid()
  )));

CREATE POLICY "habit_completions_update"
  ON public.habit_completions FOR UPDATE
  USING (habit_id IN (SELECT id FROM public.habits WHERE household_id IN (
    SELECT household_id FROM public.members WHERE user_id = auth.uid()
  )));

CREATE POLICY "habit_completions_delete"
  ON public.habit_completions FOR DELETE
  USING (habit_id IN (SELECT id FROM public.habits WHERE household_id IN (
    SELECT household_id FROM public.members WHERE user_id = auth.uid()
  )));

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.habits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_completions;
