-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo feature — budget categories + entries
-- Apply manually via Supabase SQL editor (Dashboard → SQL editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.kakebo_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid       NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  type        text        NOT NULL CHECK (type IN ('income', 'fixed', 'variable', 'leisure', 'extra')),
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kakebo_entries (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid          NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category_id  uuid          REFERENCES public.kakebo_categories(id) ON DELETE SET NULL,
  member_id    uuid          REFERENCES public.members(id) ON DELETE SET NULL,
  amount       numeric(10,2) NOT NULL,
  date         date          NOT NULL,
  description  text,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX kakebo_categories_household_idx ON public.kakebo_categories(household_id);
CREATE INDEX kakebo_entries_household_idx    ON public.kakebo_entries(household_id);
CREATE INDEX kakebo_entries_date_idx         ON public.kakebo_entries(date DESC);
CREATE INDEX kakebo_entries_category_idx     ON public.kakebo_entries(category_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Same pattern as groceries / events: any member of the household can do CRUD.

ALTER TABLE public.kakebo_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kakebo_entries    ENABLE ROW LEVEL SECURITY;

-- categories
CREATE POLICY "household members can read kakebo_categories"
  ON public.kakebo_categories FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can insert kakebo_categories"
  ON public.kakebo_categories FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can update kakebo_categories"
  ON public.kakebo_categories FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can delete kakebo_categories"
  ON public.kakebo_categories FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- entries
CREATE POLICY "household members can read kakebo_entries"
  ON public.kakebo_entries FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can insert kakebo_entries"
  ON public.kakebo_entries FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can update kakebo_entries"
  ON public.kakebo_entries FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "household members can delete kakebo_entries"
  ON public.kakebo_entries FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM public.members WHERE user_id = auth.uid()
    )
  );

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.kakebo_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kakebo_entries;
