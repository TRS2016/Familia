-- Preuve photo optionnelle d'une tâche réalisée (chemin dans le bucket family-moments).
ALTER TABLE public.chore_logs
  ADD COLUMN IF NOT EXISTS photo_path text;
