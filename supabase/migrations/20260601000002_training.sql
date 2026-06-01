-- ─────────────────────────────────────────────────────────────────────────────
-- Feature Training : minuteurs (Tabata, EMOM, AMRAP, For Time, Intervalles)
-- presets partagés dans le foyer + historique des séances
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Presets (modèles de séance partagés) ──────────────────────────────────────

CREATE TABLE public.training_presets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  name         text        NOT NULL CHECK (char_length(trim(name)) >= 1),
  mode         text        NOT NULL CHECK (mode IN ('tabata','emom','amrap','fortime','intervals')),
  config       jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX training_presets_household_idx ON public.training_presets(household_id);

-- ── Historique des séances réalisées ──────────────────────────────────────────

CREATE TABLE public.training_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id        uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  name             text        NOT NULL,
  mode             text        NOT NULL,
  duration_seconds integer     NOT NULL DEFAULT 0,
  completed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX training_sessions_household_idx ON public.training_sessions(household_id);

-- ── RLS — tout membre du foyer peut CRUD (même pattern que kakebo) ────────────

ALTER TABLE public.training_presets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_select" ON public.training_presets FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "tp_insert" ON public.training_presets FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "tp_update" ON public.training_presets FOR UPDATE USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "tp_delete" ON public.training_presets FOR DELETE USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);

CREATE POLICY "ts_select" ON public.training_sessions FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "ts_insert" ON public.training_sessions FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "ts_delete" ON public.training_sessions FOR DELETE USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);

-- ── Realtime sur les presets (les membres voient les nouveaux presets) ────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.training_presets;
