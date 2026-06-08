-- Unicité (recurrence_group_id, date) pour permettre une régénération continue
-- des occurrences récurrentes via upsert idempotent (materialize-on-view).
CREATE UNIQUE INDEX IF NOT EXISTS events_recurrence_group_date_uniq
  ON public.events (recurrence_group_id, date)
  WHERE recurrence_group_id IS NOT NULL;
