-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Kakebo (2026-08-09) — trois manques structurels.
--
-- 1) Supprimer une occurrence d'une charge fixe ne tenait pas : la
--    matérialisation régénérait la ligne au prochain chargement (elle ne
--    raisonne que sur « dernière occurrence connue → mois affiché »).
--    Fix : table de tombstones `kakebo_series_skips`. Supprimer une occurrence
--    d'une série y pose une pierre tombale ; la matérialisation l'exclut.
--
-- 2) `useSavingGoalTotals` agrégeait côté client toutes les opérations
--    rattachées à un projet, sans borne → plafonné à `max_rows = 1000` et
--    silencieusement faux passé ce seuil. Fix : agrégat SQL.
--    SECURITY INVOKER : la RLS de kakebo_entries s'applique normalement.
--
-- 3) Budgets par membre et objectif d'épargne du foyer hors Realtime : une
--    modification sur un appareil restait périmée sur les autres.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Occurrences de série supprimées ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kakebo_series_skips (
  series_id    uuid        NOT NULL,
  date         date        NOT NULL,
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, date)
);

CREATE INDEX IF NOT EXISTS kakebo_series_skips_household_idx
  ON public.kakebo_series_skips(household_id);

ALTER TABLE public.kakebo_series_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kss_select" ON public.kakebo_series_skips FOR SELECT USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "kss_insert" ON public.kakebo_series_skips FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);
CREATE POLICY "kss_delete" ON public.kakebo_series_skips FOR DELETE USING (
  household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid())
);

-- ── 2. Totaux des projets d'épargne (agrégat serveur) ────────────────────────

CREATE OR REPLACE FUNCTION public.kakebo_saving_goal_totals(p_household_id uuid)
RETURNS TABLE (saving_goal_id uuid, total numeric)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT e.saving_goal_id, SUM(e.amount)::numeric
  FROM public.kakebo_entries e
  WHERE e.household_id = p_household_id
    AND e.saving_goal_id IS NOT NULL
  GROUP BY e.saving_goal_id;
$$;

-- ── 3. Realtime manquant ─────────────────────────────────────────────────────
-- Piège supabase-js : une table absente de la publication rend muet le canal
-- ENTIER, pas seulement son propre abonnement. D'où les gardes ci-dessous.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'kakebo_member_budgets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kakebo_member_budgets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'kakebo_series_skips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kakebo_series_skips;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'households'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.households;
  END IF;
END $$;
