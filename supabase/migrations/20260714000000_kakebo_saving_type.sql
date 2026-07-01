-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo — nouveau type de catégorie « saving » (épargne mise de côté)
--
-- Une catégorie de type `saving` représente un virement du compte courant vers
-- un compte épargne. Ce n'est PAS une dépense de consommation : elle est exclue
-- du total des dépenses et de l'épargne réelle (revenus − dépenses conso), et
-- suivie séparément comme « épargne mise de côté ». Évite le double comptage.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kakebo_categories DROP CONSTRAINT kakebo_categories_type_check;

ALTER TABLE public.kakebo_categories ADD CONSTRAINT kakebo_categories_type_check
  CHECK (type IN ('income', 'fixed', 'variable', 'leisure', 'extra', 'saving'));
