-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo : date de fin d'échéance pour les charges récurrentes.
--   series_end : dernier mois (inclus) où l'occurrence doit être générée.
--   Stocké comme date = dernier jour du mois d'échéance. NULL = sans fin
--   (comportement historique). Porté sur chaque occurrence comme `recurring`.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kakebo_entries
  ADD COLUMN IF NOT EXISTS series_end date;
