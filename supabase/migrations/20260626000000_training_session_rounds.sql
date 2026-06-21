-- ─────────────────────────────────────────────────────────────────────────────
-- Training : nombre de tours réalisés (AMRAP / For Time)
-- Les modes au score (AMRAP = max de tours, For Time = tours pour le chrono)
-- ne stockaient que la durée ; on perd le score. On l'enregistre ici.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS rounds integer;
