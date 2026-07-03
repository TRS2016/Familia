-- ─────────────────────────────────────────────────────────────────────────────
-- Lecteur : (1) now-playing partagé — l'appareil DJ publie le morceau en cours,
-- l'edge jukebox le sert aux invités (qui pollent déjà toutes les 8 s) ;
-- (2) compteur d'écoutes sur les fichiers de la bibliothèque.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.lecteur_now_playing (
  household_id  uuid        PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  queue_item_id uuid,       -- id lecteur_queue (dénormalisé, sans FK : la ligne queue peut disparaître)
  title         text        NOT NULL,
  requested_by  text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lecteur_now_playing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lecteur_now_playing_select" ON public.lecteur_now_playing FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "lecteur_now_playing_insert" ON public.lecteur_now_playing FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "lecteur_now_playing_update" ON public.lecteur_now_playing FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "lecteur_now_playing_delete" ON public.lecteur_now_playing FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- Compteur d'écoutes (incrément atomique via RPC, RLS du foyer appliquée).
ALTER TABLE public.media_files ADD COLUMN play_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_media_play(p_file_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.media_files SET play_count = play_count + 1 WHERE id = p_file_id;
$$;
