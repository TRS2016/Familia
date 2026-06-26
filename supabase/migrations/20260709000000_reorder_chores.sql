-- Réordonne les tâches du catalogue : position = index dans le tableau.
-- security invoker (défaut) → la RLS du foyer s'applique.
CREATE OR REPLACE FUNCTION public.reorder_chores(p_ids uuid[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.chores c
  SET position = u.ord::int
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE c.id = u.id;
$$;
