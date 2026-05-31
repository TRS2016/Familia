-- Bibliothèque de fichiers média famille (lecteur audio/vidéo)

CREATE TABLE media_files (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id    UUID        REFERENCES members(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL CHECK (char_length(trim(title)) >= 1),
  description  TEXT,
  file_path    TEXT,
  external_url TEXT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT file_or_url CHECK (file_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE INDEX ON media_files(household_id);

ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mf_select" ON media_files FOR SELECT USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "mf_insert" ON media_files FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "mf_update" ON media_files FOR UPDATE USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "mf_delete" ON media_files FOR DELETE USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);

-- Migrer les media_items ayant un fichier uploadé vers media_files
INSERT INTO media_files (id, household_id, member_id, title, file_path, external_url, mime_type, created_at)
SELECT id, household_id, member_id, title, file_path, external_url, mime_type, created_at
FROM media_items
WHERE file_path IS NOT NULL;

-- Recréer playlist_items pour référencer media_files au lieu de media_items
DROP TABLE IF EXISTS playlist_items;

CREATE TABLE playlist_items (
  id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id   UUID     NOT NULL REFERENCES playlists(id)    ON DELETE CASCADE,
  media_file_id UUID     NOT NULL REFERENCES media_files(id)  ON DELETE CASCADE,
  position      SMALLINT NOT NULL DEFAULT 0,
  added_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(playlist_id, media_file_id)
);

CREATE INDEX ON playlist_items(playlist_id, position);

ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pli_all" ON playlist_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM playlists p
    JOIN members m ON m.household_id = p.household_id
    WHERE p.id = playlist_items.playlist_id
      AND m.user_id = auth.uid()
  ));
