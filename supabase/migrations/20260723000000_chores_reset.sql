-- ─────────────────────────────────────────────────────────────────────────────
-- Tâches : « repartir de zéro ». Efface toute l'ACTIVITÉ du foyer (pointages,
-- points/XP, badges, échanges de récompenses, mercis, réponses de pénibilité,
-- assignations — les rappels dédupliqués suivent en cascade) mais CONSERVE la
-- configuration : catalogue de tâches, récompenses, tâches détestées,
-- objectifs familiaux (leur progression, dérivée de point_events, retombe à 0).
--
-- SECURITY DEFINER obligatoire : chore_thanks et chore_feedback n'ont
-- volontairement AUCUNE policy DELETE (un merci est non annulable à l'unité) ;
-- la remise à zéro globale est le seul chemin d'effacement, gardé par
-- l'appartenance au foyer de l'appelant (auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_chores_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hh uuid;
BEGIN
  SELECT household_id INTO hh FROM members WHERE user_id = auth.uid() LIMIT 1;
  IF hh IS NULL THEN
    RAISE EXCEPTION 'membre introuvable';
  END IF;

  DELETE FROM chore_thanks        WHERE household_id = hh;
  DELETE FROM chore_feedback      WHERE household_id = hh;
  DELETE FROM reward_redemptions  WHERE household_id = hh;
  DELETE FROM member_achievements WHERE household_id = hh;
  DELETE FROM point_events        WHERE household_id = hh;
  DELETE FROM chore_logs          WHERE household_id = hh;
  DELETE FROM chore_assignments   WHERE household_id = hh; -- cascade : chore_reminders_sent
END;
$$;
