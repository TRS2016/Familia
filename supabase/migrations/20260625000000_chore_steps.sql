-- ─────────────────────────────────────────────────────────────────────────────
-- Consignes & étapes des tâches.
-- - Sur le template (chores) : un texte libre (recette/remarques) + une liste
--   ordonnée d'étapes.
-- - Sur l'occurrence (chore_assignments) : les indices d'étapes cochées, pour une
--   progression sauvegardée et partagée en temps réel (chore_assignments est déjà
--   dans la publication realtime).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chores
  ADD COLUMN instructions text,
  ADD COLUMN steps        text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.chore_assignments
  ADD COLUMN steps_done   int[]  NOT NULL DEFAULT '{}';
