-- Support fichier/URL et playlists pour la feature Médias

ALTER TABLE media_items
  ADD COLUMN file_path    text,
  ADD COLUMN external_url text,
  ADD COLUMN mime_type    text;

CREATE TABLE playlists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id     uuid        REFERENCES members(id) ON DELETE SET NULL,
  name          text        NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  description   text,
  type          text        NOT NULL DEFAULT 'manual' CHECK (type IN ('manual', 'smart')),
  smart_filters jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE playlist_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id   uuid        NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  media_item_id uuid        NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  position      smallint    NOT NULL DEFAULT 0,
  added_at      timestamptz DEFAULT now(),
  UNIQUE(playlist_id, media_item_id)
);

CREATE INDEX ON playlists(household_id);
CREATE INDEX ON playlist_items(playlist_id, position);

ALTER TABLE playlists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage playlists"
  ON playlists FOR ALL
  USING (EXISTS (SELECT 1 FROM members WHERE household_id = playlists.household_id));

CREATE POLICY "household members can manage playlist items"
  ON playlist_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM playlists p
    JOIN members m ON m.household_id = p.household_id
    WHERE p.id = playlist_items.playlist_id
  ));
