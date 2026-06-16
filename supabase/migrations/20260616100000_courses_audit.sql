-- Audit Courses (2026-06-16) : opérations atomiques (remplacent des séquences
-- insert/delete non transactionnelles côté client) + purge des tokens expirés.
-- Fonctions SECURITY INVOKER : la RLS des tables s'applique (un membre n'agit que
-- dans son foyer), et le corps plpgsql est transactionnel (tout ou rien).

-- ── #4 Déplacement atomique d'un article entre deux listes sauvegardées ────────
CREATE OR REPLACE FUNCTION public.move_saved_item(p_item uuid, p_to_list uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO grocery_saved_items (list_id, name, quantity, price, category, store)
  SELECT p_to_list, name, quantity, price, category, store
  FROM grocery_saved_items WHERE id = p_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grocery_saved_items: article introuvable';
  END IF;
  DELETE FROM grocery_saved_items WHERE id = p_item;
END;
$$;

-- ── #4 Sauvegarde atomique d'une liste modèle (liste + articles) ───────────────
-- p_items = jsonb [{ name, quantity, price, category, store }]. Retourne l'id créé.
CREATE OR REPLACE FUNCTION public.save_grocery_list(p_name text, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE new_id uuid; hh uuid;
BEGIN
  hh := get_my_household_id();
  INSERT INTO grocery_saved_lists (household_id, name) VALUES (hh, p_name)
  RETURNING id INTO new_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO grocery_saved_items (list_id, name, quantity, price, category, store)
    SELECT new_id,
           trim(e->>'name'),
           nullif(trim(e->>'quantity'), ''),
           nullif(e->>'price', '')::numeric,
           nullif(trim(e->>'category'), ''),
           nullif(trim(e->>'store'), '')
    FROM jsonb_array_elements(p_items) e
    WHERE coalesce(trim(e->>'name'), '') <> '';
  END IF;

  RETURN new_id;
END;
$$;

-- ── #4 Remplacement atomique du catalogue (import CSV/XLSX) ────────────────────
-- p_rows = jsonb [{ name, price, quantity, category, store }]. Retourne le nb inséré.
-- Delete puis insert dans une même transaction : un échec annule tout (aucune perte).
CREATE OR REPLACE FUNCTION public.replace_grocery_catalog(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE hh uuid; n integer;
BEGIN
  hh := get_my_household_id();
  DELETE FROM grocery_catalog WHERE household_id = hh;

  INSERT INTO grocery_catalog (household_id, name, price, quantity, category, store)
  SELECT hh,
         trim(e->>'name'),
         nullif(e->>'price', '')::numeric,
         nullif(trim(e->>'quantity'), ''),
         nullif(trim(e->>'category'), ''),
         nullif(trim(e->>'store'), '')
  FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
  WHERE coalesce(trim(e->>'name'), '') <> '';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── #5 Purge des tokens de partage expirés (pg_cron déjà activé) ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-shared-list-tokens',
      '31 4 * * *',
      $cron$ DELETE FROM public.shared_list_tokens WHERE expires_at < now() $cron$
    );
  END IF;
END;
$$;
