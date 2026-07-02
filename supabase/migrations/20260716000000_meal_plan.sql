-- ─────────────────────────────────────────────────────────────────────────────
-- Planning des repas : une recette par créneau (jour × type de repas).
-- Relié au carnet de recettes ; la semaine planifiée peut être ajoutée d'un
-- clic à la liste de courses (agrégation des ingrédients côté client).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.meal_plan_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  meal_type    text        NOT NULL CHECK (meal_type IN ('petit_dej', 'dejeuner', 'collation', 'diner')),
  recipe_id    uuid        NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  created_by   uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, date, meal_type)
);

CREATE INDEX meal_plan_household_date_idx ON public.meal_plan_entries(household_id, date);

ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meal_plan_select" ON public.meal_plan_entries FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "meal_plan_insert" ON public.meal_plan_entries FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "meal_plan_update" ON public.meal_plan_entries FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "meal_plan_delete" ON public.meal_plan_entries FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_plan_entries;
