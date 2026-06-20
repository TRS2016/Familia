-- ─────────────────────────────────────────────────────────────────────────────
-- Chores feature (Lot 3) — récompenses réelles personnalisables.
-- Le solde DÉPENSABLE d'un membre = XP gagné (point_events) − coût des
-- récompenses échangées (redemptions non refusées). L'XP à vie (niveaux/badges)
-- n'est jamais décrémenté : les deux notions cohabitent sur la même monnaie.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

-- Catalogue de récompenses du foyer. member_id null = dispo pour tous.
CREATE TABLE public.rewards (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  emoji        text        NOT NULL DEFAULT '🎁',
  cost_points  int         NOT NULL,
  member_id    uuid        REFERENCES public.members(id) ON DELETE CASCADE,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Échanges. status : requested → approved/declined (par un membre), puis fulfilled.
CREATE TABLE public.reward_redemptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  reward_id    uuid        REFERENCES public.rewards(id) ON DELETE SET NULL,
  member_id    uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  label        text        NOT NULL,    -- snapshot du nom (la récompense peut être supprimée)
  cost_points  int         NOT NULL,    -- snapshot du coût
  status       text        NOT NULL DEFAULT 'requested', -- requested | approved | fulfilled | declined
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX rewards_household_idx              ON public.rewards(household_id);
CREATE INDEX reward_redemptions_household_idx   ON public.reward_redemptions(household_id);
CREATE INDEX reward_redemptions_member_idx      ON public.reward_redemptions(member_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.rewards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rewards_select" ON public.rewards FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "rewards_insert" ON public.rewards FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "rewards_update" ON public.rewards FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "rewards_delete" ON public.rewards FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

CREATE POLICY "reward_redemptions_select" ON public.reward_redemptions FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "reward_redemptions_insert" ON public.reward_redemptions FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "reward_redemptions_update" ON public.reward_redemptions FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "reward_redemptions_delete" ON public.reward_redemptions FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

-- ── Solde dépensable (fonction réutilisée par redeem_reward) ───────────────────
-- = somme des points gagnés − coût des échanges non refusés.
CREATE OR REPLACE FUNCTION public.spendable_balance(p_member_id uuid)
RETURNS int
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    coalesce((SELECT sum(points) FROM point_events WHERE member_id = p_member_id), 0)
    - coalesce((SELECT sum(cost_points) FROM reward_redemptions
                WHERE member_id = p_member_id AND status <> 'declined'), 0);
$$;

-- ── RPC ───────────────────────────────────────────────────────────────────────

-- Échange : vérifie le solde, crée la demande (status 'requested'). Le coût est
-- figé dans la ligne ; un autre membre approuve/refuse via resolve_redemption.
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

-- Résout une demande : approved | fulfilled | declined (+ horodatage).
CREATE OR REPLACE FUNCTION public.resolve_redemption(p_redemption_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('approved', 'fulfilled', 'declined') THEN
    RAISE EXCEPTION 'statut invalide: %', p_status;
  END IF;
  UPDATE reward_redemptions
     SET status = p_status, resolved_at = now()
   WHERE id = p_redemption_id;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.rewards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reward_redemptions;
