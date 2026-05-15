ALTER TABLE public.events ADD COLUMN description text DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN recurrence_type text DEFAULT NULL;
