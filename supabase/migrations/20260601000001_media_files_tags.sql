-- Tags libres sur les fichiers du Lecteur (catégories souples)
ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Index GIN pour filtrer/chercher par tag efficacement
CREATE INDEX IF NOT EXISTS media_files_tags_idx ON media_files USING GIN (tags);
