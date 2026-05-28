CREATE TABLE moment_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id  uuid        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  member_id  uuid        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  emoji      text        NOT NULL CHECK (emoji IN ('❤️','😄','👍','😮')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (moment_id, member_id, emoji)
);

ALTER TABLE moment_reactions ENABLE ROW LEVEL SECURITY;

-- Tous les membres du même foyer peuvent lire/écrire leurs réactions
CREATE POLICY "household members can manage reactions"
  ON moment_reactions FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM moments m
      JOIN members mb ON mb.household_id = m.household_id
      WHERE m.id  = moment_reactions.moment_id
        AND mb.id = moment_reactions.member_id
    )
  );
