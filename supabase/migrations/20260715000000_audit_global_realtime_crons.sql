-- ─────────────────────────────────────────────────────────────────────────────
-- Audit global 2026-07-02 : deux bugs silencieux.
--
-- 1) Realtime Moments mort (régression) : useMomentsRealtime écoute
--    moment_photos depuis l'audit Moments, mais la table n'a jamais été ajoutée
--    à la publication → le canal ENTIER est muet (piège supabase-js documenté
--    dans 20260612000000).
--
-- 2) Tous les crons qui appellent des Edge Functions échouent en 401 :
--    les redéploiements ont remis verify_jwt=true (défaut CLI) alors que les
--    commandes cron postent sans header d'auth. Vérifié en base :
--    net._http_response = 144 × 401 sur 6 h. Les rappels événements/habitudes/
--    tâches étaient donc morts silencieusement (cron.job_run_details dit
--    "succeeded" car net.http_post est asynchrone).
--    Fix : header d'auth avec la clé publishable (publique par design, déjà
--    dans le bundle client ; la gateway l'accepte pour verify_jwt — vérifié).
--    ⚠️ Si la clé publishable est un jour ROTATÉE, re-programmer ces crons.
--
-- Au passage : création du cron remind-budget-daily (bloc commenté de
-- 20260703000000 jamais exécuté — l'alerte budget n'a jamais tourné).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.moment_photos;

-- Re-programmation des crons edge avec header d'auth ────────────────────────
DO $$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY[
    'remind-events-every-5min',
    'remind-habits-every-5min',
    'remind-chores-evening',
    'recap-chores-weekly',
    'remind-budget-daily'
  ] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule(
  'remind-events-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-events',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'remind-habits-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-habits',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'remind-chores-evening',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-chores',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'recap-chores-weekly',
  '0 18 * * 0',
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/recap-chores',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'remind-budget-daily',
  '0 19 * * *',  -- 19h UTC ~ 20h/21h Paris
  $$
  SELECT net.http_post(
    url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-budget',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_CcPhS0nqlgH_5J5irbJ1Ag_fOFX61QZ"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
