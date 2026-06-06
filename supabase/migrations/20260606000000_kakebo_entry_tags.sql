-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo : tags libres sur les opérations (filtrage par tag dans une catégorie)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kakebo_entries
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS kakebo_entries_tags_idx
  ON public.kakebo_entries USING gin (tags);
