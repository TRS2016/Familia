-- Lien optionnel d'une tâche vers une recette (ex. tâche « Cuisiner »).
ALTER TABLE public.chores
  ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL;
