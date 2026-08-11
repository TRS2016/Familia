-- Glisser-déposer du lecteur : réordonnancement d'une liste entière en un appel.
-- Les positions sont des epoch ms (clé d'ordre) : on réécrit la plage occupée
-- par les ids passés en repartant de leur minimum, donc les éléments ajoutés
-- plus tard (Date.now(), bien plus grand) restent après la liste réordonnée.
-- security invoker (défaut) → la RLS du foyer s'applique.

CREATE OR REPLACE FUNCTION public.reorder_lecteur_queue(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_base bigint;
BEGIN
  SELECT COALESCE(MIN(position), 0) INTO v_base
  FROM public.lecteur_queue WHERE id = ANY(p_ids);

  UPDATE public.lecteur_queue q
  SET position = v_base + u.ord
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE q.id = u.id;
END $$;

CREATE OR REPLACE FUNCTION public.reorder_playlist_items(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_base bigint;
BEGIN
  SELECT COALESCE(MIN(position), 0) INTO v_base
  FROM public.playlist_items WHERE id = ANY(p_ids);

  UPDATE public.playlist_items pi
  SET position = v_base + u.ord
  FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)
  WHERE pi.id = u.id;
END $$;

REVOKE ALL ON FUNCTION public.reorder_lecteur_queue(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_playlist_items(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_lecteur_queue(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_playlist_items(uuid[]) TO authenticated;
