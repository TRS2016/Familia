import { Link } from 'react-router-dom'
import { Check, ListChecks } from 'lucide-react'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import { memberColor } from '../../lib/constants'
import { useMember } from '../../auth/useMember'
import { useMemberTotals, useMemberPointsSince, useFamilyGoals, memberPoints, sumPoints, type PointMap } from './useGamification'
import { balanceOf } from './useEquilibre'
import { useChores, useChoreAssignments, useRecentChoreLogs, useLogChore } from './useChores'
import EquityBalance from './EquityBalance'
import { levelForXp, levelEmoji } from './achievements'
import styles from './ChoresHomeWidget.module.css'

interface Props {
  members: { id: string; display_name: string }[]
}

/** Widget Home compact : balance d'équité de la semaine (à deux) + objectif.
 *  La balance remplace le meneur : on entretient un équilibre, pas un podium. */
export default function ChoresHomeWidget({ members }: Props) {
  const { data: totals = {} as PointMap } = useMemberTotals()
  const { data: goals = [] } = useFamilyGoals()
  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const { data: weekPoints = {} as PointMap } = useMemberPointsSince(weekStartStr)
  const { data: monthPoints = {} as PointMap } = useMemberPointsSince(monthStartStr)

  const duo = members.length === 2 ? ([members[0], members[1]] as const) : null
  const balance = duo ? balanceOf(weekPoints, duo[0].id, duo[1].id) : null

  // Repli hors duo (foyer à 1 ou 3+ membres) : le meneur, comme avant.
  const ranked = members
    .map((m, i) => ({ m, color: memberColor(i), xp: memberPoints(totals, m.id) }))
    .sort((a, b) => b.xp - a.xp)
  const leader = ranked[0]

  // Ma prochaine tâche du jour : validable sans ouvrir la page Tâches.
  const { data: currentMember } = useMember()
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: chores = [] } = useChores()
  const { data: todayAssignments = [] } = useChoreAssignments(today, today)
  const { data: logs = [] } = useRecentChoreLogs()
  const logChore = useLogChore()
  const loggedAssignments = new Set(logs.map(l => l.assignment_id).filter(Boolean))
  const nextAssignment = todayAssignments.find(a =>
    a.status === 'pending'
    && !loggedAssignments.has(a.id)
    && (a.member_id === null || a.member_id === currentMember?.id)
    && chores.some(c => c.id === a.chore_id))
  const nextChore = nextAssignment ? chores.find(c => c.id === nextAssignment.chore_id) ?? null : null

  const goal = goals[0]
  const goalCurrent = !goal ? 0
    : goal.period === 'week' ? sumPoints(weekPoints)
    : goal.period === 'month' ? sumPoints(monthPoints)
    : sumPoints(totals)
  const goalPct = goal ? Math.min(100, Math.round((goalCurrent / goal.target_points) * 100)) : 0

  // Rien à montrer tant qu'aucune tâche n'a rapporté de points et qu'aucun
  // objectif n'est fixé : on masque le widget plutôt qu'un placeholder vide.
  if (!goal && sumPoints(totals) === 0 && !nextChore) return null

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>Tâches</span>
        <Link to="/chores" className={styles.seeAll}>Voir tout</Link>
      </div>
      <Link to="/chores" className={styles.card}>
        {duo && balance ? (
          <EquityBalance
            aName={duo[0].display_name} bName={duo[1].display_name}
            aColor={memberColor(0)} bColor={memberColor(1)}
            balance={balance} label="Équilibre du foyer" compact
          />
        ) : leader && leader.xp > 0 ? (
          <div className={styles.line}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span className={styles.leader}>👑 {leader.m.display_name}</span>
            <span className={styles.leaderMeta}>
              {levelEmoji(levelForXp(leader.xp).level)} Niv. {levelForXp(leader.xp).level} · {leader.xp} XP
            </span>
          </div>
        ) : !goal ? (
          <div className={styles.line}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span className={styles.muted}>Valide des tâches pour gagner des points</span>
          </div>
        ) : null}
        {goal && (
          <div className={styles.goal}>
            <div className={styles.goalHead}>
              <span className={styles.goalLabel}>🎯 {goal.label}</span>
              <span className={styles.goalMeta}>{goalCurrent}/{goal.target_points}</span>
            </div>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        )}
      </Link>
      {/* Hors du lien : un bouton imbriqué dans un <a> serait invalide. */}
      {nextChore && nextAssignment && currentMember && (
        <div className={styles.nextTask}>
          <span className={styles.nextEmoji}>{nextChore.emoji}</span>
          <span className={styles.nextName}>{nextChore.name}</span>
          <span className={styles.nextPts}>+{nextChore.points}</span>
          <button
            className={styles.nextDone}
            disabled={logChore.isPending}
            aria-label={`Marquer « ${nextChore.name} » fait`}
            onClick={() => logChore.mutate({
              chore_id: nextChore.id,
              assignment_id: nextAssignment.id,
              member_id: nextAssignment.member_id ?? currentMember.id,
              done_on: today,
            })}
          >
            <Check size={16} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  )
}
