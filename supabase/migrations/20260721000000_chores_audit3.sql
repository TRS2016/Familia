-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Chores (3e passe, 2026-07-05) — sécurité + robustesse du jeu.
--
-- 1) resolve_redemption : RÉGRESSION corrigée. 20260702000000 (audit_hardening)
--    a fait CREATE OR REPLACE en partant de la version 20260622 et a écrasé le
--    garde anti auto-validation ajouté par 20260623000000 (S1). Ici : garde S1
--    + filtre household + machine à états (requested → approved/declined,
--    approved → fulfilled ; toute autre transition refusée — plus de
--    « fulfilled → declined » qui remboursait après remise).
-- 2) redeem_reward : le demandeur est TOUJOURS l'appelant (dérivé de
--    auth.uid()). L'ancien p_member_id permettait de dépenser les points d'un
--    autre membre puis d'auto-approuver (le requester n'étant pas soi).
--    Signature changée → DROP puis CREATE.
-- 3) log_chore : le bonus de série (+10 à chaque palier de 7 jours d'affilée)
--    est déplacé côté serveur — l'insert client direct dans point_events
--    violait l'invariant « octroi centralisé » et sa dédup SELECT-puis-INSERT
--    n'était pas atomique (double bonus possible à deux appareils). Ancrage
--    Europe/Paris, advisory lock par membre, un bonus par membre et par jour,
--    ref_id = log déclencheur (repris par undo_chore_log). Le calcul serveur
--    n'est plus plafonné à 66 jours (le bonus mourait après le palier 63).
--    Au passage : rattrape unique_violation (index 20260712) pour renvoyer le
--    log gagnant au lieu d'une erreur, et snapshot de la catégorie (5).
-- 4) undo_chore_log : supprime aussi le bonus de série déclenché par ce log.
-- 5) chore_logs.category : snapshot de la catégorie au moment du pointage.
--    Avant, chore_counts_by_category() rebasculait les logs d'un template
--    supprimé en « autre » → les compteurs de badges par catégorie (Chef,
--    Super-parent…) pouvaient régresser. Backfill depuis les templates actuels.
-- 6) chores.archived_at : colonne morte depuis le hard delete (3fef86b),
--    supprimée (les edges remind-chores/daily-digest sont mises à jour).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 5) Snapshot de catégorie sur les logs ─────────────────────────────────────

ALTER TABLE public.chore_logs ADD COLUMN IF NOT EXISTS category text;

UPDATE public.chore_logs l
SET category = c.category
FROM public.chores c
WHERE l.chore_id = c.id AND l.category IS NULL;

CREATE OR REPLACE FUNCTION public.chore_counts_by_category()
RETURNS TABLE(member_id uuid, category text, cnt bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT l.member_id,
         coalesce(l.category, c.category, 'autre') AS category,
         count(*)::bigint
  FROM chore_logs l
  LEFT JOIN chores c ON c.id = l.chore_id
  GROUP BY l.member_id, coalesce(l.category, c.category, 'autre');
$$;

-- ── 6) Colonne morte ──────────────────────────────────────────────────────────

ALTER TABLE public.chores DROP COLUMN IF EXISTS archived_at;

-- ── 1) resolve_redemption : garde S1 + household + machine à états ────────────

CREATE OR REPLACE FUNCTION public.resolve_redemption(p_redemption_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_requester uuid;
  v_status    text;
  v_me        uuid;
BEGIN
  IF p_status NOT IN ('approved', 'fulfilled', 'declined') THEN
    RAISE EXCEPTION 'statut invalide: %', p_status;
  END IF;

  SELECT member_id, status INTO v_requester, v_status
  FROM reward_redemptions
  WHERE id = p_redemption_id AND household_id = get_my_household_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demande introuvable';
  END IF;

  -- Machine à états : requested → approved/declined ; approved → fulfilled.
  IF NOT ((v_status = 'requested' AND p_status IN ('approved', 'declined'))
       OR (v_status = 'approved'  AND p_status = 'fulfilled')) THEN
    RAISE EXCEPTION 'transition % → % interdite', v_status, p_status;
  END IF;

  -- S1 : on ne valide/refuse pas sa propre demande ('fulfilled' reste ouvert).
  SELECT id INTO v_me FROM members WHERE user_id = auth.uid() LIMIT 1;
  IF p_status IN ('approved', 'declined') AND v_requester = v_me THEN
    RAISE EXCEPTION 'auto-validation interdite';
  END IF;

  UPDATE reward_redemptions
     SET status = p_status, resolved_at = now()
   WHERE id = p_redemption_id;
END;
$$;

-- ── 2) redeem_reward : demandeur = appelant ───────────────────────────────────

DROP FUNCTION IF EXISTS public.redeem_reward(uuid, uuid);

CREATE OR REPLACE FUNCTION public.redeem_reward(p_reward_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  hh        uuid;
  v_member  uuid;
  v_name    text;
  v_cost    int;
  v_balance int;
  v_id      uuid;
BEGIN
  hh := get_my_household_id();
  SELECT id INTO v_member FROM members WHERE user_id = auth.uid() LIMIT 1;
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'membre introuvable';
  END IF;

  -- S2 : sérialise les échanges concurrents du même membre.
  PERFORM pg_advisory_xact_lock(hashtext('redeem:' || v_member::text));

  SELECT name, cost_points INTO v_name, v_cost
  FROM rewards WHERE id = p_reward_id AND active AND household_id = hh;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reward introuvable ou inactive';
  END IF;

  v_balance := spendable_balance(v_member);
  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'solde insuffisant (% < %)', v_balance, v_cost;
  END IF;

  INSERT INTO reward_redemptions (household_id, reward_id, member_id, label, cost_points, status)
  VALUES (hh, p_reward_id, v_member, v_name, v_cost, 'requested')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 3) log_chore : idempotence totale + snapshot catégorie + bonus de série ───

CREATE OR REPLACE FUNCTION public.log_chore(
  p_chore_id      uuid,
  p_assignment_id uuid,
  p_member_id     uuid,
  p_done_on       date,
  p_label         text,
  p_note          text,
  p_points        int DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  hh         uuid;
  v_points   int := 0;
  v_log_id   uuid;
  v_category text;
  v_today    date := (now() AT TIME ZONE 'Europe/Paris')::date;
  v_day      date;
  v_streak   int := 0;
BEGIN
  hh := get_my_household_id();

  -- Anti-rejeu : si l'assignment a déjà un log, on le renvoie sans re-créditer.
  IF p_assignment_id IS NOT NULL THEN
    SELECT id INTO v_log_id FROM chore_logs WHERE assignment_id = p_assignment_id LIMIT 1;
    IF v_log_id IS NOT NULL THEN
      RETURN v_log_id;
    END IF;
  END IF;

  IF p_chore_id IS NOT NULL THEN
    SELECT points, category INTO v_points, v_category FROM chores WHERE id = p_chore_id;
    v_points := coalesce(v_points, 0);
  ELSE
    -- Tâche ad-hoc libre : montant fourni par l'appelant (sinon 0).
    v_points := coalesce(p_points, 0);
  END IF;

  BEGIN
    INSERT INTO chore_logs (household_id, chore_id, assignment_id, member_id, done_on, label, points_awarded, note, category)
    VALUES (hh, p_chore_id, p_assignment_id, p_member_id,
            coalesce(p_done_on, v_today),
            nullif(trim(p_label), ''), v_points, nullif(trim(p_note), ''), v_category)
    RETURNING id INTO v_log_id;
  EXCEPTION WHEN unique_violation THEN
    -- Course entre deux appareils (index 20260712) : renvoie le log gagnant.
    SELECT id INTO v_log_id FROM chore_logs WHERE assignment_id = p_assignment_id LIMIT 1;
    RETURN v_log_id;
  END;

  IF v_points <> 0 THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, v_points, 'chore', 'chore_log', v_log_id);
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'done' WHERE id = p_assignment_id;
  END IF;

  -- Bonus de série : +10 à chaque palier de 7 jours d'affilée (7, 14, 21…).
  -- Advisory lock par membre = pas de double bonus en concurrence ; dédup un
  -- bonus par membre et par jour Paris ; ref_id = log déclencheur pour que
  -- undo_chore_log reprenne le bonus avec le pointage.
  PERFORM pg_advisory_xact_lock(hashtext('streak:' || p_member_id::text));
  v_day := v_today;
  IF NOT EXISTS (SELECT 1 FROM chore_logs WHERE member_id = p_member_id AND done_on = v_day) THEN
    v_day := v_day - 1; -- rien aujourd'hui : la série court encore depuis hier
  END IF;
  WHILE v_streak < 400 AND EXISTS (
    SELECT 1 FROM chore_logs WHERE member_id = p_member_id AND done_on = v_day
  ) LOOP
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  END LOOP;

  IF v_streak >= 7 AND v_streak % 7 = 0 AND NOT EXISTS (
    SELECT 1 FROM point_events
    WHERE member_id = p_member_id
      AND ref_type = 'streak_bonus'
      AND (created_at AT TIME ZONE 'Europe/Paris')::date = v_today
  ) THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, 10, 'bonus', 'streak_bonus', v_log_id);
  END IF;

  RETURN v_log_id;
END;
$$;

-- ── 4) undo_chore_log : reprend aussi le bonus de série lié ───────────────────

CREATE OR REPLACE FUNCTION public.undo_chore_log(p_log_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_assignment uuid;
BEGIN
  SELECT assignment_id INTO v_assignment FROM chore_logs WHERE id = p_log_id;

  DELETE FROM point_events WHERE ref_id = p_log_id AND ref_type IN ('chore_log', 'streak_bonus');
  DELETE FROM chore_logs WHERE id = p_log_id;

  IF v_assignment IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'pending' WHERE id = v_assignment;
  END IF;
END;
$$;
