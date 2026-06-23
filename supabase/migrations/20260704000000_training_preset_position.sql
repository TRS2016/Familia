-- Presets d'entraînement : ordre d'affichage personnalisable.
ALTER TABLE public.training_presets
  ADD COLUMN IF NOT EXISTS position integer;

-- Backfill : ordre actuel (création décroissante = ce que la page affiche).
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY household_id ORDER BY created_at DESC) AS rn
  FROM public.training_presets
)
UPDATE public.training_presets p
   SET position = o.rn
  FROM ordered o
 WHERE p.id = o.id AND p.position IS NULL;

-- Réordonne en une requête : position = index dans le tableau.
-- security invoker (défaut) → la RLS du foyer s'applique.
CREATE OR REPLACE FUNCTION public.reorder_training_presets(p_ids uuid[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.training_presets p
  SET position = u.ord::int
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE p.id = u.id;
$$;
