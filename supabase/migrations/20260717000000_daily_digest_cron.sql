-- ─────────────────────────────────────────────────────────────────────────────
-- Digest du matin : cron quotidien → edge daily-digest (une push par membre
-- résumant sa journée : événements, tâches, habitudes, repas planifiés).
-- Header d'auth obligatoire (verify_jwt=true) — voir 20260715000000.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-digest-morning') THEN
    PERFORM cron.unschedule('daily-digest-morning');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-digest-morning',
  '0 6 * * *',  -- 6h UTC ~ 7h/8h Paris selon la saison
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/daily-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
