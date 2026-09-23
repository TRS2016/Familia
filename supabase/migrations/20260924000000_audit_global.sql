-- ─────────────────────────────────────────────────────────────────────────────
-- Audit global (2026-09-24)
--
-- 1) daily-digest et recap-chores n'avaient AUCUNE déduplication : chaque appel
--    envoyait un push à chaque membre. Or `verify_jwt` ne protège rien ici (la
--    gateway accepte la clé publishable, constante de build présente dans le
--    bundle), donc la fonction était rappelable en boucle par n'importe qui.
--    La dédup est le garde robuste : elle ne dépend d'aucun secret partagé et
--    d'aucune reprogrammation de cron.
--
-- 2) reset_chores_data() est la seule fonction SECURITY DEFINER vivante à ne pas
--    révoquer l'exécution à `anon`. Son contrôle d'appartenance tient déjà
--    (auth.uid() nul => aucun foyer trouvé => exception), mais la règle du
--    projet veut les deux.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Déduplication des envois récurrents ──────────────────────────────────
-- Même motif que chore_reminders_sent / event_reminders_sent : RLS active et
-- AUCUNE policy, donc écriture réservée au service role (les Edge Functions).

CREATE TABLE IF NOT EXISTS public.daily_digest_sent (
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  sent_date date NOT NULL,
  PRIMARY KEY (member_id, sent_date)
);
ALTER TABLE public.daily_digest_sent ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chores_recap_sent (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  PRIMARY KEY (household_id, week_start)
);
ALTER TABLE public.chores_recap_sent ENABLE ROW LEVEL SECURITY;

-- ── 2. reset_chores_data : REVOKE manquant ──────────────────────────────────

REVOKE ALL ON FUNCTION public.reset_chores_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_chores_data() TO authenticated;

-- ── 3. Purge des tables de dédup (même cadence que les autres) ──────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-digest-dedup',
      '41 4 * * *',
      $cron$
        DELETE FROM public.daily_digest_sent  WHERE sent_date  < current_date - 7;
        DELETE FROM public.chores_recap_sent  WHERE week_start < current_date - 60;
      $cron$
    );
  END IF;
END $$;
