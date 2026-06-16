-- Audit Training (2026-06-16) : historique des séances en temps réel.
-- Sans cette table dans la publication, le canal realtime (qui écoute aussi
-- training_presets) ne diffuse jamais les nouvelles séances d'un autre membre.
-- Garde idempotente : ne pas échouer si déjà membre de la publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'training_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_sessions;
  END IF;
END;
$$;
