ALTER TABLE public.events ADD COLUMN recurrence_group_id uuid;

CREATE INDEX ON public.events(household_id, recurrence_group_id);
