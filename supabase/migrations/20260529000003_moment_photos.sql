CREATE TABLE moment_photos (
  id         uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid     NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  photo_path text     NOT NULL,
  position   smallint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(moment_id, position)
);

CREATE INDEX ON moment_photos(moment_id, position);

-- Migrer les photos existantes depuis moments.photo_path
INSERT INTO moment_photos (moment_id, photo_path, position)
SELECT id, photo_path, 0
FROM moments
WHERE photo_path IS NOT NULL AND photo_archived = false;

ALTER TABLE moment_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage moment photos"
  ON moment_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM moments m
      JOIN members mb ON mb.household_id = m.household_id
      WHERE m.id = moment_photos.moment_id
    )
  );
