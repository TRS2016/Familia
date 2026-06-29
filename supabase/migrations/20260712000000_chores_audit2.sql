-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Chores (2e passe, 2026-06-29) — robustesse du pointage.
-- #2 : anti double-crédit. log_chore fait un SELECT-puis-INSERT non atomique ;
-- deux appareils cochant la même assignation au même instant créaient 2 logs +
-- 2 point_events. Un index unique partiel rend le 2e INSERT impossible (la RPC
-- relit alors la ligne gagnante au prochain appel et reste idempotente).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS chore_logs_assignment_unique
  ON public.chore_logs (assignment_id)
  WHERE assignment_id IS NOT NULL;
