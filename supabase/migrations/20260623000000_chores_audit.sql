-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Chores (2026-06-21) — corrections B1/B4/S1/S2 + agrégats serveur (P1).
-- Toutes les fonctions restent SECURITY INVOKER : la RLS des tables filtre les
-- lignes au foyer de l'appelant avant agrégation.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── B4 : log_chore accepte un montant de points explicite (tâches ad-hoc libres)
-- Signature changée (ajout p_points) → DROP puis CREATE.
DROP FUNCTION IF EXISTS public.log_chore(uuid, uuid, uuid, date, text, text);

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
  hh        uuid;
  v_points  int := 0;
  v_log_id  uuid;
BEGIN
  hh := get_my_household_id();

  IF p_assignment_id IS NOT NULL THEN
    SELECT id INTO v_log_id FROM chore_logs WHERE assignment_id = p_assignment_id LIMIT 1;
    IF v_log_id IS NOT NULL THEN
      RETURN v_log_id;
    END IF;
  END IF;

  IF p_chore_id IS NOT NULL THEN
    SELECT points INTO v_points FROM chores WHERE id = p_chore_id;
    v_points := coalesce(v_points, 0);
  ELSE
    -- Tâche ad-hoc libre : montant fourni par l'appelant (sinon 0).
    v_points := coalesce(p_points, 0);
  END IF;

  INSERT INTO chore_logs (household_id, chore_id, assignment_id, member_id, done_on, label, points_awarded, note)
  VALUES (hh, p_chore_id, p_assignment_id, p_member_id,
          coalesce(p_done_on, (now() AT TIME ZONE 'Europe/Paris')::date),
          nullif(trim(p_label), ''), v_points, nullif(trim(p_note), ''))
  RETURNING id INTO v_log_id;

  IF v_points <> 0 THEN
    INSERT INTO point_events (household_id, member_id, points, reason, ref_type, ref_id)
    VALUES (hh, p_member_id, v_points, 'chore', 'chore_log', v_log_id);
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    UPDATE chore_assignments SET status = 'done' WHERE id = p_assignment_id;
  END IF;

  RETURN v_log_id;
END;
$$;

-- ── S2 : redeem_reward — verrou applicatif par membre (sérialise les échanges
-- concurrents pour que le contrôle de solde soit fiable).
CREATE OR REPLACE FUNCTION public.redeem_reward(p_reward_id uuid, p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  hh        uuid;
  v_name    text;
  v_cost    int;
  v_balance int;
  v_id      uuid;
BEGIN
  hh := get_my_household_id();
  PERFORM pg_advisory_xact_lock(hashtext('redeem:' || p_member_id::text));

  SELECT name, cost_points INTO v_name, v_cost FROM rewards WHERE id = p_reward_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reward introuvable ou inactive';
  END IF;

  v_balance := spendable_balance(p_member_id);
  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'solde insuffisant (% < %)', v_balance, v_cost;
  END IF;

  INSERT INTO reward_redemptions (household_id, reward_id, member_id, label, cost_points, status)
  VALUES (hh, p_reward_id, p_member_id, v_name, v_cost, 'requested')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── S1 : resolve_redemption — interdit l'auto-validation (approve/decline d'une
-- demande dont on est soi-même le demandeur). 'fulfilled' (remise effectuée)
-- reste autorisé pour n'importe quel membre.
CREATE OR REPLACE FUNCTION public.resolve_redemption(p_redemption_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_requester uuid; v_me uuid;
BEGIN
  IF p_status NOT IN ('approved', 'fulfilled', 'declined') THEN
    RAISE EXCEPTION 'statut invalide: %', p_status;
  END IF;

  SELECT member_id INTO v_requester FROM reward_redemptions WHERE id = p_redemption_id;
  SELECT id INTO v_me FROM members WHERE user_id = auth.uid() LIMIT 1;

  IF p_status IN ('approved', 'declined') AND v_requester = v_me THEN
    RAISE EXCEPTION 'auto-validation interdite';
  END IF;

  UPDATE reward_redemptions
     SET status = p_status, resolved_at = now()
   WHERE id = p_redemption_id;
END;
$$;

-- ── B1/P1 : agrégats serveur (compteurs « à vie » non fenêtrés + totaux de
-- points sans charger tout l'historique côté client).

-- Total d'XP à vie par membre.
CREATE OR REPLACE FUNCTION public.member_point_totals()
RETURNS TABLE(member_id uuid, total bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT member_id, sum(points)::bigint FROM point_events GROUP BY member_id;
$$;

-- Points par membre depuis une date (semaine/mois courant) — heure de Paris.
CREATE OR REPLACE FUNCTION public.member_points_since(p_start date)
RETURNS TABLE(member_id uuid, total bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT member_id, sum(points)::bigint FROM point_events
  WHERE (created_at AT TIME ZONE 'Europe/Paris')::date >= p_start
  GROUP BY member_id;
$$;

-- Nombre de tâches faites par membre et par catégorie (à vie) — pour les badges.
CREATE OR REPLACE FUNCTION public.chore_counts_by_category()
RETURNS TABLE(member_id uuid, category text, cnt bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT l.member_id, coalesce(c.category, 'autre') AS category, count(*)::bigint
  FROM chore_logs l
  LEFT JOIN chores c ON c.id = l.chore_id
  GROUP BY l.member_id, coalesce(c.category, 'autre');
$$;
