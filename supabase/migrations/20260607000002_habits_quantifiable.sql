-- ─────────────────────────────────────────────────────────────────────────────
-- Habitudes quantifiables : objectif chiffré par jour (compteur)
--   habits.target_count        : objectif quotidien (1 = simple oui/non)
--   habit_completions.count    : progression du jour ; completed = count >= target
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS target_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.habit_completions
  ADD COLUMN IF NOT EXISTS count integer NOT NULL DEFAULT 1;
