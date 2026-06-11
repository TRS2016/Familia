-- Audit Lecteur (2026-06-11) : cache recherche YouTube, durée des pistes,
-- position playlist en bigint, hygiène lecteur_queue.

-- Cache des recherches YouTube (lu/écrit uniquement par l'Edge Function
-- yt-search via service role : RLS activée sans policy).
CREATE TABLE public.yt_search_cache (
  q          text PRIMARY KEY,
  results    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.yt_search_cache ENABLE ROW LEVEL SECURITY;

-- Durée (secondes) des fichiers uploadés, capturée côté client à l'upload.
ALTER TABLE public.media_files ADD COLUMN duration_seconds int;

-- La clé d'ordre devient un timestamp (Date.now()) comme lecteur_queue :
-- SMALLINT débordait et le calcul client (length du cache) créait des doublons.
ALTER TABLE public.playlist_items ALTER COLUMN position TYPE bigint;

-- Hygiène lecteur_queue : FK manquante vers households + WITH CHECK sur UPDATE.
ALTER TABLE public.lecteur_queue
  ADD CONSTRAINT lecteur_queue_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

DROP POLICY "update own household lecteur_queue" ON public.lecteur_queue;
CREATE POLICY "update own household lecteur_queue" ON public.lecteur_queue FOR UPDATE
  USING      (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
