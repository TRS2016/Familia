import { useEffect, useMemo, useRef, useState } from 'react'
import { Target, Pencil, Trophy } from 'lucide-react'
import { useToast } from '../../components/useToast'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import type { Chore, ChoreLog, HouseholdMember } from './useChores'
import {
  useMemberTotals, useMemberPointsSince, useChoreCounts,
  useMemberAchievements, useFamilyGoals,
  useUnlockAchievements, useUpsertFamilyGoal, useDeleteFamilyGoal,
  memberPoints, sumPoints,
  type FamilyGoal, type FamilyGoalInput, type PointMap,
} from './useGamification'
import { ACHIEVEMENTS, levelForXp, levelEmoji, type AchievementCtx } from './achievements'
import { memberStreakDays } from './chores.utils'
import {
  useThanks, useWeeklyPoints, balanceOf, coupleStreak,
  thanksReceived, thanksSentCount, lastCompletedWeekStart,
} from './useEquilibre'
import EquityBalance from './EquityBalance'
import { categoryOf } from './categories'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import styles from './ChoresPage.module.css'

interface Props {
  members: HouseholdMember[]
  chores: Chore[]
  logs: ChoreLog[]
  currentMemberId: string | null
}

const PERIOD_LABEL: Record<string, string> = { week: 'cette semaine', month: 'ce mois', open: 'au total' }

export default function ProgressionTab({ members, chores, logs, currentMemberId }: Props) {
  const { data: totals = {} as PointMap } = useMemberTotals()
  const { data: achievements = [] } = useMemberAchievements()
  const { data: goals = [] } = useFamilyGoals()
  const { data: counts = [] } = useChoreCounts()
  const unlock = useUnlockAchievements()
  const { showToast } = useToast()

  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const { data: weekPoints = {} as PointMap } = useMemberPointsSince(weekStartStr)
  const { data: monthPoints = {} as PointMap } = useMemberPointsSince(monthStartStr)

  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<FamilyGoal | null>(null)

  const weekTotal = useMemo(() => sumPoints(weekPoints), [weekPoints])

  // ── Équilibre du foyer (pensé pour 2 adultes) ───────────────────────────────
  const { data: thanks = [] } = useThanks()
  const { data: weeklyRows = [] } = useWeeklyPoints()
  const duo = members.length === 2 ? ([members[0], members[1]] as const) : null
  const balance = duo ? balanceOf(weekPoints, duo[0].id, duo[1].id) : null
  // Streak de couple : semaines TERMINÉES dans la zone équilibrée (la semaine
  // en cours ne compte qu'une fois finie — l'edge du dimanche la clôt).
  const coupleWeeks = duo ? coupleStreak(weeklyRows, duo[0].id, duo[1].id, lastCompletedWeekStart()) : 0

  // Compteurs « à vie » par membre (total + par catégorie) depuis l'agrégat serveur.
  const countsByMember = useMemo(() => {
    const total = new Map<string, number>()
    const byCat = new Map<string, Record<string, number>>()
    for (const c of counts) {
      total.set(c.member_id, (total.get(c.member_id) ?? 0) + c.cnt)
      const rec = byCat.get(c.member_id) ?? {}
      rec[c.category] = (rec[c.category] ?? 0) + c.cnt
      byCat.set(c.member_id, rec)
    }
    return { total, byCat }
  }, [counts])

  // Classement (XP décroissant).
  const ranking = useMemo(() => members
    .map((m, i) => ({ member: m, color: memberColor(i), xp: memberPoints(totals, m.id) }))
    .sort((a, b) => b.xp - a.xp), [members, totals])

  // Progression d'un objectif selon sa période.
  function goalProgress(goal: FamilyGoal): number {
    if (goal.period === 'week')  return weekTotal
    if (goal.period === 'month') return sumPoints(monthPoints)
    return sumPoints(totals)
  }

  // Contexte de badges par membre (compteurs non fenêtrés + série 120 j).
  const ctxByMember = useMemo(() => {
    const map = new Map<string, AchievementCtx>()
    for (const m of members) {
      map.set(m.id, {
        totalXp: memberPoints(totals, m.id),
        totalChores: countsByMember.total.get(m.id) ?? 0,
        byCategory: countsByMember.byCat.get(m.id) ?? {},
        streakDays: memberStreakDays(logs, m.id),
        weekShare: weekTotal > 0 ? memberPoints(weekPoints, m.id) / weekTotal : 0,
        weekHasActivity: memberPoints(weekPoints, m.id) > 0,
        thanksSent: thanksSentCount(thanks, m.id),
      })
    }
    return map
  }, [members, logs, totals, countsByMember, weekPoints, weekTotal, thanks])

  // Évaluation + déblocage des badges manquants (idempotent). Une passe par
  // changement de contexte ; le toast n'annonce que les nouveautés réelles.
  const evaluatedRef = useRef('')
  useEffect(() => {
    const have = new Set(achievements.map(a => `${a.member_id}|${a.achievement_key}`))
    const toUnlock: { member_id: string; achievement_key: string }[] = []
    for (const m of members) {
      const ctx = ctxByMember.get(m.id)
      if (!ctx) continue
      for (const a of ACHIEVEMENTS) {
        if (a.earned(ctx) && !have.has(`${m.id}|${a.key}`)) toUnlock.push({ member_id: m.id, achievement_key: a.key })
      }
    }
    if (toUnlock.length === 0) return
    const sig = toUnlock.map(r => `${r.member_id}|${r.achievement_key}`).sort().join(',')
    if (evaluatedRef.current === sig) return // évite la double-passe avant refetch
    evaluatedRef.current = sig
    unlock.mutate(toUnlock)
    // Le toast n'annonce que MES badges (l'évaluation, idempotente, couvre tout
    // le foyer mais on ne félicite pas l'utilisateur pour les badges d'un autre).
    const mine = toUnlock.filter(r => r.member_id === currentMemberId)
    if (mine.length > 0) {
      const labels = mine.map(r => ACHIEVEMENTS.find(a => a.key === r.achievement_key)?.emoji ?? '🏅').join(' ')
      showToast({ type: 'success', message: `Badge débloqué ! ${labels}` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxByMember, achievements, members])

  // ── Stats du mois : par membre (points + tâches) et par catégorie (foyer) ──
  const monthStats = useMemo(() => {
    const choreById = new Map(chores.map(c => [c.id, c]))
    const monthLogs = logs.filter(l => l.done_on >= monthStartStr)
    const byMemberCount = new Map<string, number>()
    const byCategory = new Map<string, { cnt: number; pts: number }>()
    // Charge mentale : la dimension invisible, rendue visible séparément.
    const mentalByMember = new Map<string, number>()
    let mentalTotal = 0
    for (const l of monthLogs) {
      byMemberCount.set(l.member_id, (byMemberCount.get(l.member_id) ?? 0) + 1)
      // Catégorie : snapshot du log d'abord (survit à la suppression du template).
      const cat = l.category ?? (l.chore_id ? choreById.get(l.chore_id)?.category : null) ?? 'autre'
      const agg = byCategory.get(cat) ?? { cnt: 0, pts: 0 }
      agg.cnt += 1
      agg.pts += l.points_awarded
      byCategory.set(cat, agg)
      if (l.mental_load) {
        mentalByMember.set(l.member_id, (mentalByMember.get(l.member_id) ?? 0) + l.points_awarded)
        mentalTotal += l.points_awarded
      }
    }
    const categories = [...byCategory.entries()]
      .map(([value, agg]) => ({ ...categoryOf(value), ...agg }))
      .sort((a, b) => b.cnt - a.cnt)
    return { byMemberCount, categories, mentalByMember, mentalTotal, total: monthLogs.length }
  }, [chores, logs, monthStartStr])

  const earnedByMember = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of achievements) {
      if (!m.has(a.member_id)) m.set(a.member_id, new Set())
      m.get(a.member_id)!.add(a.achievement_key)
    }
    return m
  }, [achievements])

  if (members.length === 0) return <EmptyState emoji="👪" title="Aucun membre" />

  return (
    <div className={styles.progression}>
      {/* ── Équilibre du foyer (balance + streak de couple + mercis) ── */}
      {duo && balance && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⚖️ Équilibre de la semaine</h2>
          <div className={styles.balanceCardBox}>
            <EquityBalance
              aName={duo[0].display_name} bName={duo[1].display_name}
              aColor={memberColor(0)} bColor={memberColor(1)}
              balance={balance} coupleStreak={coupleWeeks}
            />
          </div>
          {thanks.length > 0 && (
            <div className={styles.thanksRow}>
              <span>💛 Mercis reçus</span>
              <span>
                {members.map((m, i) => {
                  const r = thanksReceived(thanks, m.id)
                  return `${i > 0 ? ' · ' : ''}${m.display_name} : ${r.week} cette semaine (${r.total} en tout)`
                }).join('')}
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── Classement ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><Trophy size={16} /> Classement</h2>
        <div className={styles.scoreCards}>
          {ranking.map(({ member, color, xp }, i) => {
            const lvl = levelForXp(xp)
            const streak = ctxByMember.get(member.id)?.streakDays ?? 0
            return (
              <div key={member.id} className={styles.scoreCard}>
                <div className={styles.scoreRank}>{i === 0 && xp > 0 ? '👑' : `#${i + 1}`}</div>
                <div className={styles.scoreAvatar} style={{ background: color }}>{member.display_name.charAt(0).toUpperCase()}</div>
                <div className={styles.scoreMain}>
                  <span className={styles.scoreName}>
                    {member.display_name}
                    {streak >= 2 && <span className={styles.streakTag} title={`${streak} jours d'affilée`}>🔥 {streak}</span>}
                  </span>
                  <span className={styles.scoreLevel}>{levelEmoji(lvl.level)} Niveau {lvl.level} · {xp} XP</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${Math.round(lvl.progress * 100)}%`, background: color }} />
                  </div>
                  <span className={styles.scoreNext}>{lvl.toNext} XP avant niveau {lvl.level + 1}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Ce mois-ci : par membre + par catégorie ────────────────── */}
      {monthStats.total > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📊 Ce mois-ci</h2>
          <div className={styles.monthStats}>
            {members.map((m, i) => {
              const pts = memberPoints(monthPoints, m.id)
              const cnt = monthStats.byMemberCount.get(m.id) ?? 0
              const maxPts = Math.max(1, ...members.map(mm => memberPoints(monthPoints, mm.id)))
              return (
                <div key={m.id} className={styles.statRow}>
                  <span className={styles.statName} style={{ color: memberColor(i) }}>{m.display_name}</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${Math.round((pts / maxPts) * 100)}%`, background: memberColor(i) }} />
                  </div>
                  <span className={styles.statMeta}>{cnt} tâche{cnt > 1 ? 's' : ''} · {pts} pts</span>
                </div>
              )
            })}
          </div>
          <div className={styles.monthStats}>
            {monthStats.categories.map(cat => {
              const maxCnt = Math.max(1, ...monthStats.categories.map(c => c.cnt))
              return (
                <div key={cat.value} className={styles.statRow}>
                  <span className={styles.statName}>{cat.emoji} {cat.label}</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${Math.round((cat.cnt / maxCnt) * 100)}%`, background: cat.color }} />
                  </div>
                  <span className={styles.statMeta}>{cat.cnt} · {cat.pts} pts</span>
                </div>
              )
            })}
          </div>
          {monthStats.mentalTotal > 0 && (
            <div className={styles.monthStats}>
              <p className={styles.statsSubTitle}>🧠 Charge mentale (la part invisible)</p>
              {members.map((m, i) => {
                const pts = monthStats.mentalByMember.get(m.id) ?? 0
                const pct = Math.round((pts / monthStats.mentalTotal) * 100)
                return (
                  <div key={m.id} className={styles.statRow}>
                    <span className={styles.statName} style={{ color: memberColor(i) }}>{m.display_name}</span>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${pct}%`, background: memberColor(i) }} />
                    </div>
                    <span className={styles.statMeta}>{pts} pts · {pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Objectif familial ──────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}><Target size={16} /> Objectif familial</h2>
          <button className={styles.linkBtn} onClick={() => { setEditingGoal(null); setGoalFormOpen(true) }}>+ Objectif</button>
        </div>
        {goals.length === 0 ? (
          <p className={styles.hint}>Aucun objectif commun. Définis une cagnotte de points à atteindre ensemble (ex. « 300 pts → soirée resto »).</p>
        ) : goals.map(goal => {
          const current = goalProgress(goal)
          const pct = Math.min(100, Math.round((current / goal.target_points) * 100))
          const reached = current >= goal.target_points
          return (
            <div key={goal.id} className={styles.goalCard}>
              <div className={styles.goalHead}>
                <span className={styles.goalLabel}>{reached ? '🎉 ' : ''}{goal.label}</span>
                <button className={styles.iconBtn} onClick={() => { setEditingGoal(goal); setGoalFormOpen(true) }} aria-label="Modifier"><Pencil size={15} /></button>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%`, background: 'var(--accent)' }} />
              </div>
              <span className={styles.goalMeta}>
                {current} / {goal.target_points} pts {PERIOD_LABEL[goal.period]}
                {goal.reward_text && ` · 🎁 ${goal.reward_text}`}
              </span>
            </div>
          )
        })}
      </section>

      {/* ── Badges ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🏅 Badges</h2>
        {members.map((m, i) => {
          const earned = earnedByMember.get(m.id) ?? new Set<string>()
          return (
            <div key={m.id} className={styles.badgeBlock}>
              <span className={styles.badgeOwner} style={{ color: memberColor(i) }}>{m.display_name}</span>
              <div className={styles.badgeGrid}>
                {ACHIEVEMENTS.map(a => {
                  const has = earned.has(a.key)
                  return (
                    <div key={a.key} className={[styles.badge, has ? styles.badgeOn : ''].join(' ')} title={a.description}>
                      <span className={styles.badgeEmoji}>{a.emoji}</span>
                      <span className={styles.badgeLabel}>{a.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </section>

      {goalFormOpen && (
        <GoalForm initial={editingGoal ?? undefined} onClose={() => setGoalFormOpen(false)} />
      )}
    </div>
  )
}

// ── Modale objectif ───────────────────────────────────────────────────────────

function GoalForm({ initial, onClose }: { initial?: FamilyGoal; onClose: () => void }) {
  const upsert = useUpsertFamilyGoal()
  const del = useDeleteFamilyGoal()
  const [label, setLabel] = useState(initial?.label ?? '')
  const [target, setTarget] = useState(initial?.target_points ?? 300)
  const [reward, setReward] = useState(initial?.reward_text ?? '')
  const [period, setPeriod] = useState<FamilyGoalInput['period']>(initial?.period ?? 'week')

  function submit() {
    if (!label.trim() || target <= 0) return
    upsert.mutate({ id: initial?.id, label, target_points: target, reward_text: reward.trim() || null, period })
    onClose()
  }

  return (
    <SlideUpModal title={initial ? 'Modifier l\'objectif' : 'Nouvel objectif familial'} onClose={onClose}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Nom</span>
          <input className={styles.input} value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex. Semaine au top" autoFocus />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Points à atteindre</span>
          <input className={styles.input} type="number" min={1} value={target} onChange={e => setTarget(Math.max(1, Number(e.target.value) || 0))} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Récompense (optionnel)</span>
          <input className={styles.input} value={reward} onChange={e => setReward(e.target.value)} placeholder="Ex. Soirée resto 🍕" />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Période</span>
          <div className={styles.chipRow}>
            {([['week', 'Chaque semaine'], ['month', 'Chaque mois'], ['open', 'Sans limite']] as const).map(([v, l]) => (
              <button type="button" key={v} className={[styles.chip, period === v ? styles.chipActive : ''].join(' ')} onClick={() => setPeriod(v)}>{l}</button>
            ))}
          </div>
        </div>
        <button className={styles.submitBtn} onClick={submit}>{initial ? 'Enregistrer' : 'Créer l\'objectif'}</button>
        {initial && (
          <button className={styles.deleteBtn} onClick={() => { del.mutate(initial.id); onClose() }}>Supprimer l'objectif</button>
        )}
      </div>
    </SlideUpModal>
  )
}
