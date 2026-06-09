-- File d'attente partagée du Lecteur (mode « jukebox de soirée »).
-- Chaque membre du foyer ajoute des morceaux ; l'appareil DJ enchaîne.
CREATE TABLE public.lecteur_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL,
  media_file_id uuid NOT NULL REFERENCES public.media_files(id) ON DELETE CASCADE,
  position      int  NOT NULL DEFAULT 0,
  added_by      uuid REFERENCES public.members(id) ON DELETE SET NULL,
  played        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.lecteur_queue(household_id);
CREATE INDEX ON public.lecteur_queue(household_id, played, position);

ALTER TABLE public.lecteur_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own household lecteur_queue"   ON public.lecteur_queue FOR SELECT
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "insert own household lecteur_queue" ON public.lecteur_queue FOR INSERT
  WITH CHECK (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "update own household lecteur_queue" ON public.lecteur_queue FOR UPDATE
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "delete own household lecteur_queue" ON public.lecteur_queue FOR DELETE
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));

ALTER PUBLICATION supabase_realtime ADD TABLE public.lecteur_queue;
