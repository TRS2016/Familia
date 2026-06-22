-- Moments : épingler un moment (favori du foyer, remonté dans une section dédiée).
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
