-- Budgets mensuels par catégorie et par membre
CREATE TABLE kakebo_member_budgets (
  member_id      UUID        NOT NULL REFERENCES members(id)           ON DELETE CASCADE,
  category_id    UUID        NOT NULL REFERENCES kakebo_categories(id) ON DELETE CASCADE,
  household_id   UUID        NOT NULL REFERENCES households(id)        ON DELETE CASCADE,
  monthly_budget NUMERIC(10,2),
  PRIMARY KEY (member_id, category_id)
);

ALTER TABLE kakebo_member_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kmb_select" ON kakebo_member_budgets FOR SELECT USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "kmb_insert" ON kakebo_member_budgets FOR INSERT WITH CHECK (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "kmb_update" ON kakebo_member_budgets FOR UPDATE USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
CREATE POLICY "kmb_delete" ON kakebo_member_budgets FOR DELETE USING (
  household_id IN (SELECT household_id FROM members WHERE user_id = auth.uid())
);
