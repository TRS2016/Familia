-- Lot 7 : partage liste externe en lecture seule via token court
CREATE TABLE shared_list_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT        NOT NULL UNIQUE
                           DEFAULT substring(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12),
  household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by   UUID        REFERENCES members(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shared_list_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tokens_select" ON shared_list_tokens
  FOR SELECT USING (household_id IN (
    SELECT household_id FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "tokens_insert" ON shared_list_tokens
  FOR INSERT WITH CHECK (household_id IN (
    SELECT household_id FROM members WHERE user_id = auth.uid()
  ));

CREATE POLICY "tokens_delete" ON shared_list_tokens
  FOR DELETE USING (household_id IN (
    SELECT household_id FROM members WHERE user_id = auth.uid()
  ));
