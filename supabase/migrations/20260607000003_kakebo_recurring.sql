-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo : opérations récurrentes (charges fixes / revenus mensuels)
--   recurring  : true = se répète chaque mois à la même date
--   series_id  : relie les occurrences d'une même récurrence
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kakebo_entries
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false;

ALTER TABLE public.kakebo_entries
  ADD COLUMN IF NOT EXISTS series_id uuid;

-- Empêche les doublons d'occurrence (même série, même date) — utile contre les
-- générations concurrentes (deux appareils). NULL series_id => lignes distinctes.
CREATE UNIQUE INDEX IF NOT EXISTS kakebo_entries_series_date_uniq
  ON public.kakebo_entries (series_id, date);
