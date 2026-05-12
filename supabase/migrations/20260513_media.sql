CREATE TABLE media_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES members(id) ON DELETE SET NULL,
  title        text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('film','série','livre')),
  status       text        NOT NULL DEFAULT 'à voir'
                           CHECK (status IN ('à voir','en cours','terminé')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON media_items(household_id);
CREATE INDEX ON media_items(status);

ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own household media"   ON media_items FOR SELECT
  USING (household_id = (SELECT household_id FROM members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "insert own household media" ON media_items FOR INSERT
  WITH CHECK (household_id = (SELECT household_id FROM members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "update own household media" ON media_items FOR UPDATE
  USING (household_id = (SELECT household_id FROM members WHERE user_id = auth.uid() LIMIT 1));
CREATE POLICY "delete own household media" ON media_items FOR DELETE
  USING (household_id = (SELECT household_id FROM members WHERE user_id = auth.uid() LIMIT 1));

ALTER PUBLICATION supabase_realtime ADD TABLE media_items;
