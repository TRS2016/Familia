-- Favoris de stations Vélo'v, par membre (feature individuelle, pas partagée foyer).
-- Avant : favoris en localStorage par appareil. Désormais : synchronisés par membre.
CREATE TABLE public.velov_favorites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  household_id uuid NOT NULL,
  station_id   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, station_id)
);

CREATE INDEX ON public.velov_favorites(member_id);

ALTER TABLE public.velov_favorites ENABLE ROW LEVEL SECURITY;

-- Chaque membre n'accède qu'à SES propres favoris (feature individuelle).
CREATE POLICY "read own velov_favorites"   ON public.velov_favorites FOR SELECT
  USING (member_id = (SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "insert own velov_favorites" ON public.velov_favorites FOR INSERT
  WITH CHECK (member_id = (SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "delete own velov_favorites" ON public.velov_favorites FOR DELETE
  USING (member_id = (SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1));

-- Sync multi-appareils (cf. piège connu : toute table écoutée doit être dans la publication).
ALTER PUBLICATION supabase_realtime ADD TABLE public.velov_favorites;
