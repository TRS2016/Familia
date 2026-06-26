-- Cron : récap hebdo des tâches, dimanche soir (18:00 UTC ≈ 19h CET / 20h CEST).
-- Appelle l'edge recap-chores (classement de la semaine + objectif familial).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'recap-chores-weekly',
      '0 18 * * 0',
      $cron$
      SELECT net.http_post(
        url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/recap-chores',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
END;
$$;
