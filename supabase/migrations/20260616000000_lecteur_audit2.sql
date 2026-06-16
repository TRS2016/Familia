-- Audit Lecteur (2026-06-16) : suppression Storage inter-membre, réordonnancement
-- atomique, purges d'hygiène.

-- ── #1 Suppression Storage à l'échelle du foyer ────────────────────────────────
-- L'ancienne policy n'autorisait que l'uploadeur (foldername[2] = son member id)
-- à effacer l'objet, alors que mf_delete (RLS DB) autorise tout membre du foyer.
-- Conséquence : une suppression inter-membre laissait un objet orphelin dans le
-- bucket. Le foyer partage déjà tout en lecture → on aligne la suppression sur
-- l'appartenance au foyer (foldername[1] = household_id).
DROP POLICY IF EXISTS "media_storage_delete" ON storage.objects;
CREATE POLICY "media_storage_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'family-media' AND
  (storage.foldername(name))[1] IN (SELECT household_id::text FROM public.members WHERE user_id = auth.uid())
);

-- ── #5 Réordonnancement atomique (échange de deux positions) ───────────────────
-- Remplace deux UPDATE séquentiels côté client (non atomiques : si le 2e échoue,
-- deux lignes partagent la même position). Fonctions SECURITY INVOKER : la RLS
-- des tables s'applique (un membre ne peut échanger que dans son foyer), et le
-- corps plpgsql est transactionnel (tout ou rien).
CREATE OR REPLACE FUNCTION public.swap_lecteur_queue_position(a uuid, b uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE pa bigint; pb bigint;
BEGIN
  SELECT position INTO pa FROM public.lecteur_queue WHERE id = a;
  SELECT position INTO pb FROM public.lecteur_queue WHERE id = b;
  IF pa IS NULL OR pb IS NULL THEN
    RAISE EXCEPTION 'lecteur_queue: item introuvable';
  END IF;
  UPDATE public.lecteur_queue SET position = pb WHERE id = a;
  UPDATE public.lecteur_queue SET position = pa WHERE id = b;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_playlist_item_position(a uuid, b uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE pa bigint; pb bigint;
BEGIN
  SELECT position INTO pa FROM public.playlist_items WHERE id = a;
  SELECT position INTO pb FROM public.playlist_items WHERE id = b;
  IF pa IS NULL OR pb IS NULL THEN
    RAISE EXCEPTION 'playlist_items: item introuvable';
  END IF;
  UPDATE public.playlist_items SET position = pb WHERE id = a;
  UPDATE public.playlist_items SET position = pa WHERE id = b;
END;
$$;

-- ── #7/#8 Purges d'hygiène (pg_cron déjà activé, cf. event_reminders) ──────────
-- Ces deletes sont du SQL pur (pas de pg_net) → exécutables directement par cron.
-- cron.schedule(jobname, …) met à jour le job s'il existe déjà.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- File de soirée : les lignes played=true au-delà de 24 h ne servent plus
    -- l'historique « joué ce soir ».
    PERFORM cron.schedule(
      'purge-lecteur-queue-played',
      '17 4 * * *',
      $cron$ DELETE FROM public.lecteur_queue WHERE played AND created_at < now() - INTERVAL '24 hours' $cron$
    );
    -- Cache de recherche YouTube : TTL applicatif de 24 h, on évince au-delà de 2 j.
    PERFORM cron.schedule(
      'purge-yt-search-cache',
      '23 4 * * *',
      $cron$ DELETE FROM public.yt_search_cache WHERE created_at < now() - INTERVAL '2 days' $cron$
    );
  END IF;
END;
$$;
