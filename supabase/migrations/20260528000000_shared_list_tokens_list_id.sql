-- Lie un token de partage à une liste sauvegardée spécifique.
-- Nullable pour compatibilité ascendante (anciens tokens sans list_id).
ALTER TABLE shared_list_tokens
ADD COLUMN list_id uuid REFERENCES grocery_saved_lists(id) ON DELETE CASCADE;
