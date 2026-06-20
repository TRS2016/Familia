-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications Chores — rappel de tâche assignée non faite en fin de journée.
-- Table de déduplication (1 rappel par assignation et par jour) + cron du soir.
-- (La demande de récompense à valider passe par l'edge notify-household,
--  invoquée côté client ; les badges restent un toast in-app.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.chore_reminders_sent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.chore_assignments(id) ON DELETE CASCADE,
  sent_date     date NOT NULL DEFAULT current_date,
  UNIQUE (assignment_id, sent_date)
);

-- RLS activée sans policy : seul le service role (edge) y accède.
ALTER TABLE public.chore_reminders_sent ENABLE ROW LEVEL SECURITY;

-- Cron : rappel du soir (18:00 UTC ≈ 19h CET / 20h CEST). pg_cron + pg_net déjà actifs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'remind-chores-evening',
      '0 18 * * *',
      $cron$
      SELECT net.http_post(
        url     := 'https://cpspnmxetubjtshsgcby.supabase.co/functions/v1/remind-chores',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
END;
$$;
