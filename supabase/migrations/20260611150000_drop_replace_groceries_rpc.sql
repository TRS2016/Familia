-- Audit Courses (2026-06-11) : suppression du RPC replace_groceries_with_list.
-- Il était SECURITY DEFINER sans contrôle d'appartenance au foyer — n'importe
-- quel porteur de la clé publique (présente dans le bundle JS) pouvait vider
-- les courses d'un foyer arbitraire. Le client ne l'appelait plus (code mort).
DROP FUNCTION IF EXISTS public.replace_groceries_with_list(uuid, uuid, jsonb);
