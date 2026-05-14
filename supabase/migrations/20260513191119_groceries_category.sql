ALTER TABLE public.groceries ADD COLUMN category text;

CREATE INDEX ON public.groceries(household_id, category);
