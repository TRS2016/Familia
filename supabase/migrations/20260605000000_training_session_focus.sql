-- ─────────────────────────────────────────────────────────────────────────────
-- Training : zone travaillée (focus) sur les séances réalisées
-- Permet d'afficher la répartition par zone (Abdos, Jambes, Cardio…) dans les stats.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS focus text;
