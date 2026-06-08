-- Réordonne les habitudes en une seule requête : position = index dans le tableau.
-- security invoker (défaut) → la RLS du foyer s'applique normalement.
CREATE OR REPLACE FUNCTION public.reorder_habits(p_ids uuid[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.habits h
  SET position = u.ord::int
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE h.id = u.id;
$$;
