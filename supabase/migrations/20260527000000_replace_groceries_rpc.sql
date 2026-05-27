-- Lot 5 : remplace la liste de courses atomiquement (DELETE + INSERT dans une transaction)
CREATE OR REPLACE FUNCTION replace_groceries_with_list(
  p_household_id UUID,
  p_member_id    UUID,
  p_items        JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM groceries WHERE household_id = p_household_id;

  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO groceries (household_id, created_by, name, quantity, price, category, store)
    SELECT
      p_household_id,
      p_member_id,
      (item->>'name')::TEXT,
      NULLIF(trim(item->>'quantity'), ''),
      (NULLIF(trim(item->>'price'), ''))::NUMERIC,
      NULLIF(trim(item->>'category'), ''),
      NULLIF(trim(item->>'store'), '')
    FROM jsonb_array_elements(p_items) AS item
    WHERE length(trim(item->>'name')) > 0;
  END IF;
END;
$$;
