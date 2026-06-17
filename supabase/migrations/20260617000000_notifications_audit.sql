-- Audit Notifications (2026-06-17).

-- ── #4 Capture push_subscriptions en versionné (créée hors migration) ──────────
-- No-op en prod (IF NOT EXISTS) ; sert à reproduire l'environnement.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member ON public.push_subscriptions(member_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions: select own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: select own" ON public.push_subscriptions FOR SELECT
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "push_subscriptions: insert own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: insert own" ON public.push_subscriptions FOR INSERT
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "push_subscriptions: update own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: update own" ON public.push_subscriptions FOR UPDATE
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "push_subscriptions: delete own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions: delete own" ON public.push_subscriptions FOR DELETE
  USING (member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid()));

-- Tables de dédup : service-role only (RLS activée, aucune policy). Idempotent.
ALTER TABLE public.event_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_reminders_sent ENABLE ROW LEVEL SECURITY;

-- ── #2 Re-déclencher un rappel après édition d'un événement ────────────────────
-- L'ancienne dédup UNIQUE(event_id) figeait le rappel à vie : changer l'heure ou
-- le délai d'un événement déjà rappelé n'envoyait jamais le nouveau rappel.
-- On dédup désormais par (event_id, instant de déclenchement) : un événement
-- modifié change d'instant → re-notifie.
ALTER TABLE public.event_reminders_sent ADD COLUMN IF NOT EXISTS trigger_at timestamptz;
ALTER TABLE public.event_reminders_sent DROP CONSTRAINT IF EXISTS event_reminders_sent_event_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS event_reminders_sent_event_trigger_key
  ON public.event_reminders_sent(event_id, trigger_at);

-- ── #3 Purge des marqueurs de rappel d'événements (comme habits) ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-event-reminders-sent',
      '41 4 * * *',
      $cron$ DELETE FROM public.event_reminders_sent WHERE reminded_at < now() - INTERVAL '2 days' $cron$
    );
  END IF;
END;
$$;
