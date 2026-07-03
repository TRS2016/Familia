import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronLeft, Pencil, Plus, Scale, Trash2, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import { useMember } from '../../auth/useMember'
import { useHouseholdMembers } from '../chores/useChores'
import {
  useRules, useRulesRealtime, useRecentBreaches, useDecideRule, useWithdrawProposal,
  useConfessBreach, useProposeRule, roman, breachDayLabel, PRIORITY_META,
} from './useRules'
import type { HouseholdRule } from './useRules'
import RuleFormModal from './RuleFormModal'
import styles from './RulesPage.module.css'

const ACTION_LABEL: Record<string, string> = {
  add: 'Nouveau commandement',
  edit: 'Révision',
  remove: 'Proposition de retrait',
}

export default function RulesPage() {
  useRulesRealtime()
  const { data: rules = [], isLoading } = useRules()
  const { data: breaches = [] } = useRecentBreaches()
  const { data: members = [] } = useHouseholdMembers()
  const { data: me } = useMember()
  const decide = useDecideRule()
  const withdraw = useWithdrawProposal()
  const confess = useConfessBreach()

  // false = fermé ; null = nouveau ; HouseholdRule = révision de ce commandement
  const [form, setForm] = useState<HouseholdRule | null | false>(false)
  const [confessTarget, setConfessTarget] = useState<HouseholdRule | null>(null)
  const [removeTarget, setRemoveTarget] = useState<HouseholdRule | null>(null)

  const active = useMemo(() => rules.filter(r => r.status === 'active'), [rules])
  const pending = useMemo(() => rules.filter(r => r.status === 'pending'), [rules])
  // Retraits/révisions déjà proposés : évite les doublons de proposition.
  const pendingTargets = useMemo(
    () => new Set(pending.map(p => p.replaces_rule_id).filter(Boolean)),
    [pending],
  )
  const memberName = (id: string | null) =>
    members.find(m => m.id === id)?.display_name ?? '—'

  const weekLoss = useMemo(() => {
    const by = new Map<string, number>()
    for (const b of breaches) by.set(b.member_id, (by.get(b.member_id) ?? 0) + Math.abs(b.points))
    return by
  }, [breaches])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Accueil"><ChevronLeft size={24} /></Link>
        <h1 className={styles.pageTitle}>Commandements</h1>
        <button className={styles.proposeBtn} onClick={() => setForm(null)}>
          <Plus size={15} strokeWidth={2.5} /> Proposer
        </button>
      </header>

      <p className={styles.preamble}>
        Ici est gravée la loi du foyer, décidée à deux et amendée à deux.
        Que chacun la relise matin, midi et soir — et confesse ses manquements avec honneur.
      </p>

      {isLoading ? (
        <div className={styles.spinnerWrap}><Spinner size={32} /></div>
      ) : (
        <>
          {/* ── Propositions en attente de l'autre parent ── */}
          {pending.length > 0 && (
            <section className={styles.pendingBlock}>
              <h2 className={styles.pendingTitle}>🕊️ En attente de validation ({pending.length})</h2>
              <ul className={styles.pendingList}>
                {pending.map(p => {
                  const mine = p.proposed_by === me?.id
                  return (
                    <li key={p.id} className={styles.pendingCard}>
                      <span className={styles.pendingKind}>{ACTION_LABEL[p.action]}</span>
                      <p className={styles.pendingText}>{p.emoji} {p.text}</p>
                      <div className={styles.pendingMeta}>
                        <span>proposé par {p.proposer?.display_name ?? '—'}</span>
                        <span className={styles.priorityChip} style={{ color: PRIORITY_META[p.priority].color }}>
                          {PRIORITY_META[p.priority].label} · -{p.points} pts
                        </span>
                      </div>
                      {mine ? (
                        <div className={styles.pendingActions}>
                          <span className={styles.pendingWait}>En attente de l'autre parent…</span>
                          <button className={styles.rejectBtn} onClick={() => withdraw.mutate(p.id)}>
                            Retirer ma proposition
                          </button>
                        </div>
                      ) : (
                        <div className={styles.pendingActions}>
                          <button
                            className={styles.approveBtn}
                            onClick={() => decide.mutate({ rule: p, approve: true })}
                            disabled={decide.isPending}
                          >
                            <Check size={14} strokeWidth={2.5} /> Approuver
                          </button>
                          <button
                            className={styles.rejectBtn}
                            onClick={() => decide.mutate({ rule: p, approve: false })}
                            disabled={decide.isPending}
                          >
                            <X size={14} strokeWidth={2.5} /> Refuser
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* ── La loi du foyer ── */}
          <ol className={styles.lawList}>
            {active.map((r, i) => (
              <li key={r.id} className={styles.lawItem}>
                <span className={styles.lawNumeral}>{roman(i + 1)}</span>
                <div className={styles.lawBody}>
                  <p className={styles.lawText}>{r.emoji} {r.text}</p>
                  <div className={styles.lawMeta}>
                    <span className={styles.priorityChip} style={{ color: PRIORITY_META[r.priority].color }}>
                      {PRIORITY_META[r.priority].label}
                    </span>
                    <span className={styles.pointsChip}>-{r.points} pts</span>
                  </div>
                </div>
                <div className={styles.lawActions}>
                  <button
                    className={styles.lawActionBtn}
                    onClick={() => setConfessTarget(r)}
                    aria-label="Confesser un manquement"
                    title="J'ai failli…"
                  >
                    <Scale size={15} strokeWidth={2} />
                  </button>
                  <button
                    className={styles.lawActionBtn}
                    onClick={() => setForm(r)}
                    disabled={pendingTargets.has(r.id)}
                    aria-label="Proposer une révision"
                    title={pendingTargets.has(r.id) ? 'Une proposition est déjà en attente' : 'Proposer une révision'}
                  >
                    <Pencil size={15} strokeWidth={2} />
                  </button>
                  <button
                    className={styles.lawActionBtn}
                    onClick={() => setRemoveTarget(r)}
                    disabled={pendingTargets.has(r.id)}
                    aria-label="Proposer le retrait"
                    title={pendingTargets.has(r.id) ? 'Une proposition est déjà en attente' : 'Proposer le retrait'}
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ol>

          {/* ── Manquements des 7 derniers jours ── */}
          <section className={styles.breachBlock}>
            <h2 className={styles.breachTitle}>⚖️ Manquements des 7 derniers jours</h2>
            {breaches.length === 0 ? (
              <p className={styles.breachEmpty}>Aucun manquement confessé — que le foyer demeure vertueux ✨</p>
            ) : (
              <>
                <div className={styles.breachTotals}>
                  {members.map(m => {
                    const loss = weekLoss.get(m.id) ?? 0
                    if (loss === 0) return null
                    return <span key={m.id} className={styles.breachTotal}>{m.display_name} : -{loss} pts</span>
                  })}
                </div>
                <ul className={styles.breachList}>
                  {breaches.map(b => (
                    <li key={b.id} className={styles.breachRow}>
                      <span className={styles.breachWho}>{memberName(b.member_id)}</span>
                      <span className={styles.breachReason}>{b.reason}</span>
                      <span className={styles.breachMeta}>{breachDayLabel(b.created_at)} · {b.points} pts</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      {form !== false && <RuleFormModal revising={form} onClose={() => setForm(false)} />}

      {/* Confession d'un manquement */}
      {confessTarget && (
        <div className={styles.overlay} onClick={() => setConfessTarget(null)}>
          <div className={styles.confirmSheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <p className={styles.confirmTitle}>Confesser un manquement ?</p>
            <p className={styles.confirmText}>
              {confessTarget.emoji} {confessTarget.text}
            </p>
            <p className={styles.confirmSub}>-{confessTarget.points} pts pour {me?.display_name ?? 'toi'}. L'honnêteté lave la faute.</p>
            <button
              className={styles.confessBtn}
              onClick={() => { confess.mutate(confessTarget); setConfessTarget(null) }}
            >
              <Scale size={15} strokeWidth={2} /> J'ai failli, je confesse
            </button>
            <button className={styles.cancelBtn} onClick={() => setConfessTarget(null)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Proposition de retrait */}
      {removeTarget && (
        <div className={styles.overlay} onClick={() => setRemoveTarget(null)}>
          <div className={styles.confirmSheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <p className={styles.confirmTitle}>Proposer le retrait ?</p>
            <p className={styles.confirmText}>{removeTarget.emoji} {removeTarget.text}</p>
            <p className={styles.confirmSub}>Le commandement ne sera retiré que si l'autre parent approuve.</p>
            <RemoveProposalButton rule={removeTarget} onDone={() => setRemoveTarget(null)} />
            <button className={styles.cancelBtn} onClick={() => setRemoveTarget(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RemoveProposalButton({ rule, onDone }: { rule: HouseholdRule; onDone: () => void }) {
  const propose = useProposeRule()
  return (
    <button
      className={styles.confessBtn}
      disabled={propose.isPending}
      onClick={() => propose.mutate(
        {
          action: 'remove',
          text: rule.text,
          emoji: rule.emoji,
          priority: rule.priority,
          points: rule.points,
          replaces_rule_id: rule.id,
        },
        { onSuccess: onDone },
      )}
    >
      <Trash2 size={15} strokeWidth={2} /> Soumettre le retrait
    </button>
  )
}
