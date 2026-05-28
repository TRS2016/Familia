-- Trace les rappels déjà envoyés pour éviter les doublons
CREATE TABLE event_reminders_sent (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reminded_at timestamptz DEFAULT now(),
  UNIQUE(event_id)
);

-- Extensions nécessaires pour appeler une edge function depuis pg_cron
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Stocke le secret de cron dans la config DB (remplacer xxx par la vraie valeur)
-- ALTER DATABASE postgres SET app.remind_secret = 'xxx';

-- Une fois le secret configuré, activer le job :
-- SELECT cron.schedule(
--   'remind-events-every-5min',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-events',
--     headers := jsonb_build_object(
--       'Content-Type',    'application/json',
--       'X-Remind-Secret', current_setting('app.remind_secret')
--     ),
--     body    := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
