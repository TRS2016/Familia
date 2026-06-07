-- ─────────────────────────────────────────────────────────────────────────────
-- Habitudes : type « à faire » (do) ou « à éviter » (avoid)
-- Pour une habitude avoid, cocher = « tenu » ce jour-là.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'do';

ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_kind_check;
ALTER TABLE public.habits
  ADD CONSTRAINT habits_kind_check CHECK (kind IN ('do', 'avoid'));
