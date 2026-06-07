-- ─────────────────────────────────────────────────────────────────────────────
-- Habitudes : ordre d'affichage personnalisable (colonne position)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS position integer;

-- Backfill : ordre actuel (par date de création) au sein de chaque foyer
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY household_id ORDER BY created_at) AS rn
  FROM public.habits
)
UPDATE public.habits h
   SET position = o.rn
  FROM ordered o
 WHERE h.id = o.id
   AND h.position IS NULL;
