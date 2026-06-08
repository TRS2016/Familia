-- Notes & commentaires par membre (au lieu d'une note unique partagée par média).
CREATE TABLE public.media_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_item_id uuid NOT NULL REFERENCES public.media_items(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  household_id  uuid NOT NULL,
  rating        int CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_item_id, member_id)
);

CREATE INDEX ON public.media_ratings(media_item_id);
CREATE INDEX ON public.media_ratings(household_id);

ALTER TABLE public.media_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own household media_ratings"   ON public.media_ratings FOR SELECT
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "insert own household media_ratings" ON public.media_ratings FOR INSERT
  WITH CHECK (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "update own household media_ratings" ON public.media_ratings FOR UPDATE
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "delete own household media_ratings" ON public.media_ratings FOR DELETE
  USING (household_id = (SELECT household_id FROM public.members WHERE user_id = auth.uid() LIMIT 1));

ALTER PUBLICATION supabase_realtime ADD TABLE public.media_ratings;

-- Migre les notes/commentaires existants vers le membre propriétaire du média.
INSERT INTO public.media_ratings (media_item_id, member_id, household_id, rating, comment)
SELECT id, member_id, household_id, rating, comment
FROM public.media_items
WHERE member_id IS NOT NULL AND (rating IS NOT NULL OR comment IS NOT NULL)
ON CONFLICT (media_item_id, member_id) DO NOTHING;
