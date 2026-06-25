-- ─────────────────────────────────────────────────────────────────────────────
-- Recettes : carnet de recettes du foyer, relié aux courses (ingrédients) et à
-- la gamification des tâches (« j'ai cuisiné » = points via log_chore).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.recipes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  meal_type    text        NOT NULL CHECK (meal_type IN ('petit_dej', 'dejeuner', 'collation', 'diner')),
  ingredients  jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- [{ "name": "...", "quantity": "..." }]
  steps        jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ["étape 1", "étape 2", …]
  points       int         NOT NULL DEFAULT 10,
  created_by   uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipes_household_idx ON public.recipes(household_id);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_select" ON public.recipes FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "recipes_insert" ON public.recipes FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "recipes_update" ON public.recipes FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "recipes_delete" ON public.recipes FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.recipes;
