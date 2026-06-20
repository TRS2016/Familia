import { useEffect, useMemo, useRef, useState } from 'react'
import { Target, Pencil, Trophy } from 'lucide-react'
import { useToast } from '../../components/useToast'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import type { Chore, ChoreLog, HouseholdMember } from './useChores'
import {
  usePointEvents, useMemberAchievements, useFamilyGoals,
  useUnlockAchievements, useUpsertFamilyGoal, useDeleteFamilyGoal,
  totalsByMember, periodStart, pointsSince,
  type FamilyGoal, type FamilyGoalInput,
} from './useGamification'
import { ACHIEVEMENTS, levelForXp, levelEmoji, type AchievementCtx } from './achievements'
import { memberStats } from './chores.utils'
import styles from './ChoresPage.module.css'

interface Props {
  members: HouseholdMember[]
  chores: Chore[]
  logs: ChoreLog[]
}

const PERIOD_LABEL: Record<string, string> = { week: 'cette semaine', month: 'ce mois', open: 'au total' }

export default function ProgressionTab({ members, chores, logs }: Props) {
  const { data: events = [] } = usePointEvents()
  const { data: achievements = [] } = useMemberAchievements()
  const { data: goals = [] } = useFamilyGoals()
  const unlock = useUnlockAchievements()
  const { showToast } = useToast()

  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<FamilyGoal | null>(null)

  const categoryByChore = useMemo(() => new Map(chores.map(c => [c.id, c.category])), [chores])
  const totals = useMemo(() => totalsByMember(events), [events])

  // Points de la semaine (pour la part équitable des badges).
  const weekStartStr = periodStart({ period: 'week', period_start: '' })
  const weekPoints = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) if (e.created_at.slice(0, 10) >= weekStartStr) m.set(e.member_id, (m.get(e.member_id) ?? 0) + e.points)
    return m
  }, [events, weekStartStr])
  const weekTotal = [...weekPoints.values()].reduce((a, b) => a + b, 0)

  // Classement (XP décroissant).
  const ranking = useMemo(() => members
    .map((m, i) => ({ member: m, color: memberColor(i), xp: totals.get(m.id) ?? 0 }))
    .sort((a, b) => b.xp - a.xp), [members, totals])

  // Contexte de badges par membre.
  const ctxByMember = useMemo(() => {
    const map = new Map<string, AchievementCtx>()
    for (const m of members) {
      const st = memberStats(logs, categoryByChore, m.id)
      map.set(m.id, {
        totalXp: totals.get(m.id) ?? 0,
        totalChores: st.totalChores,
        byCategory: st.byCategory,
        streakDays: st.streakDays,
        weekShare: weekTotal > 0 ? (weekPoints.get(m.id) ?? 0) / weekTotal : 0,
        weekHasActivity: (weekPoints.get(m.id) ?? 0) > 0,
      })
    }
    return map
  }, [members, logs, categoryByChore, totals, weekPoints, weekTotal])

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
    const labels = toUnlock.map(r => ACHIEVEMENTS.find(a => a.key === r.achievement_key)?.emoji ?? '🏅').join(' ')
    showToast({ type: 'success', message: `Badge débloqué ! ${labels}` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxByMember, achievements, members])

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
      {/* ── Classement ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><Trophy size={16} /> Classement</h2>
        <div className={styles.scoreCards}>
          {ranking.map(({ member, color, xp }, i) => {
            const lvl = levelForXp(xp)
            return (
              <div key={member.id} className={styles.scoreCard}>
                <div className={styles.scoreRank}>{i === 0 && xp > 0 ? '👑' : `#${i + 1}`}</div>
                <div className={styles.scoreAvatar} style={{ background: color }}>{member.display_name.charAt(0).toUpperCase()}</div>
                <div className={styles.scoreMain}>
                  <span className={styles.scoreName}>{member.display_name}</span>
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

      {/* ── Objectif familial ──────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}><Target size={16} /> Objectif familial</h2>
          <button className={styles.linkBtn} onClick={() => { setEditingGoal(null); setGoalFormOpen(true) }}>+ Objectif</button>
        </div>
        {goals.length === 0 ? (
          <p className={styles.hint}>Aucun objectif commun. Définis une cagnotte de points à atteindre ensemble (ex. « 300 pts → soirée resto »).</p>
        ) : goals.map(goal => {
          const start = periodStart(goal)
          const current = pointsSince(events, start)
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
