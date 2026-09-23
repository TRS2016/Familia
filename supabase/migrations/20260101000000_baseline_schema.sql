-- ─────────────────────────────────────────────────────────────────────────────
-- SOCLE DU SCHEMA (reconstruit le 2026-09-24)
--
-- Pourquoi ce fichier existe
-- --------------------------
-- Les cinq tables fondatrices (households, members, events, groceries, moments)
-- ont ete creees a la main dans le tableau de bord Supabase AVANT que
-- l'historique de migrations ne commence. Resultat : la toute premiere
-- migration (20260512000000_kakebo.sql) reference deja public.members des sa
-- ligne 20, et l'historique n'est donc PAS rejouable. Un `supabase db reset`,
-- un environnement de test ou une reconstruction apres incident echouaient
-- immediatement. Ce socle retablit la reproductibilite.
--
-- Securite de ce fichier
-- ----------------------
-- Tout est idempotent et sans effet sur la base de production :
--   - CREATE TABLE IF NOT EXISTS ne touche pas aux tables existantes ;
--   - ENABLE ROW LEVEL SECURITY est deja actif, donc sans effet ;
--   - les policies ne sont creees QUE si elles sont absentes (controle sur
--     pg_policies), donc celles de production ne sont JAMAIS ecrasees.
--
-- Limite a connaitre
-- ------------------
-- Faute d'acces a `supabase db dump` (Docker absent de la machine), ce socle a
-- ete reconstruit depuis src/lib/database.types.ts, lui-meme genere depuis la
-- base reelle : les colonnes et leur nullabilite sont fideles, les types SQL
-- sont precis, mais les valeurs par defaut et les contraintes sont des
-- inferences raisonnables. Les colonnes ajoutees plus tard par migration sont
-- volontairement ABSENTES : les ALTER TABLE existants s'en chargent ensuite
-- dans l'ordre (plusieurs ne sont pas idempotents, les dupliquer ici casserait
-- un reset).
--
-- A FAIRE quand Docker est disponible, pour remplacer ce fichier par la verite :
--   supabase db dump --linked --schema public -f baseline.sql
--   puis n'en garder que les 5 tables ci-dessous, leurs index et leurs policies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.households (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  kakebo_objectif_epargne numeric(10,2),
  created_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- user_id reference auth.users : un membre = un compte (magic-link).
CREATE TABLE IF NOT EXISTS public.members (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          text        NOT NULL,
  email                 text,
  notifications_enabled boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS members_household_idx ON public.members (household_id);
CREATE INDEX IF NOT EXISTS members_user_idx      ON public.members (user_id);

CREATE TABLE IF NOT EXISTS public.events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id    uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  title        text        NOT NULL,
  date         date        NOT NULL,
  start_time   time,
  end_time     time,
  all_day      boolean     NOT NULL DEFAULT false,
  location     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS events_household_date_idx ON public.events (household_id, date);

CREATE TABLE IF NOT EXISTS public.groceries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  quantity     text,
  checked      boolean     NOT NULL DEFAULT false,
  checked_at   timestamptz,
  checked_by   uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_by   uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.groceries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS groceries_household_idx ON public.groceries (household_id);

CREATE TABLE IF NOT EXISTS public.moments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id      uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  text           text,
  photo_path     text,
  photo_archived boolean     NOT NULL DEFAULT false,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS moments_household_created_idx ON public.moments (household_id, created_at DESC);

-- ── Policies : creees seulement si absentes ─────────────────────────────────
-- Motif standard du projet : acces limite au foyer de l'appelant.
-- `members` fait exception (c'est elle qui definit l'appartenance) : lecture des
-- membres de son foyer, ecriture de sa propre ligne uniquement.
-- Le controle sur pg_policies garantit que la production n'est jamais ecrasee.

DO $policies$
DECLARE
  t  text;
  op text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'groceries', 'moments'] LOOP
    FOREACH op IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND policyname = t || '_' || lower(op)
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR %s %s (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()))',
          t || '_' || lower(op), t, op,
          CASE WHEN op = 'INSERT' THEN 'WITH CHECK' ELSE 'USING' END
        );
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'households' AND policyname = 'households_select') THEN
    CREATE POLICY "households_select" ON public.households FOR SELECT
      USING (id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'households' AND policyname = 'households_update') THEN
    CREATE POLICY "households_update" ON public.households FOR UPDATE
      USING (id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_select') THEN
    CREATE POLICY "members_select" ON public.members FOR SELECT
      USING (household_id IN (SELECT m.household_id FROM public.members m WHERE m.user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_update') THEN
    CREATE POLICY "members_update" ON public.members FOR UPDATE
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$policies$;
