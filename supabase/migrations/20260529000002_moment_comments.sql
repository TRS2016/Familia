CREATE TABLE moment_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  member_id  uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  text       text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON moment_comments(moment_id);

ALTER TABLE moment_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can manage comments"
  ON moment_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM moments m
      JOIN members mb ON mb.household_id = m.household_id
      WHERE m.id  = moment_comments.moment_id
        AND mb.id = moment_comments.member_id
    )
  );
