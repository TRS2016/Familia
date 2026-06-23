-- ─────────────────────────────────────────────────────────────────────────────
-- Alertes de dépassement de budget Kakebo. Déduplication : une alerte par
-- périmètre (foyer/membre + catégorie) et par mois. Écrite par l'Edge Function
-- remind-budget (service role) ; RLS activée sans policy → invisible aux clients.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kakebo_budget_alerts_sent (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  scope_key    text        NOT NULL,   -- ex. 'foyer:<cat>' ou 'member:<member>:<cat>'
  period       text        NOT NULL,   -- 'YYYY-MM' (mois Paris)
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, period)
);

ALTER TABLE public.kakebo_budget_alerts_sent ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul le service role (qui bypass la RLS) y accède.

-- Cron (à programmer manuellement dans le SQL editor après déploiement) :
-- SELECT cron.schedule(
--   'remind-budget-daily',
--   '0 19 * * *',  -- 19h UTC ~ 20h/21h Paris
--   $$
--   SELECT net.http_post(
--     url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-budget',
--     headers := '{"Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
