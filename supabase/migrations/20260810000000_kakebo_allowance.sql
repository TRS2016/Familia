-- ─────────────────────────────────────────────────────────────────────────────
-- Kakebo — enveloppe « argent de poche » (nouveau type de catégorie 'allowance')
--
-- Une catégorie de type `allowance` porte la somme ALLOUÉE à l'argent de poche
-- (ex. un retrait de 200 €). C'est une dépense réelle : elle compte dans le
-- total du mois, comme n'importe quelle autre.
--
-- Les opérations tagguées `argent-poche` dans une AUTRE catégorie ne sont que
-- le détail de ce que l'enveloppe est devenue (pain 100, bonbons 100). Elles ne
-- sont donc PAS recomptées — sinon les 200 € seraient comptés deux fois. Seul
-- le dépassement de l'enveloppe (détail − alloué, si positif) s'ajoute aux
-- dépenses : cet argent-là vient bien d'ailleurs.
--
-- Le calcul est fait par périmètre (foyer / membre), comme le reste de la page.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.kakebo_categories DROP CONSTRAINT kakebo_categories_type_check;

ALTER TABLE public.kakebo_categories ADD CONSTRAINT kakebo_categories_type_check
  CHECK (type IN ('income', 'fixed', 'variable', 'leisure', 'extra', 'saving', 'allowance'));
