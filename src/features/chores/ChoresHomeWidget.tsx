import { Link } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import { memberColor } from '../../lib/constants'
import { useMemberTotals, useMemberPointsSince, useFamilyGoals, memberPoints, sumPoints, type PointMap } from './useGamification'
import { levelForXp, levelEmoji } from './achievements'
import styles from './ChoresHomeWidget.module.css'

interface Props {
  members: { id: string; display_name: string }[]
}

/** Widget Home compact : meneur du classement + progression de l'objectif. */
export default function ChoresHomeWidget({ members }: Props) {
  const { data: totals = {} as PointMap } = useMemberTotals()
  const { data: goals = [] } = useFamilyGoals()
  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const { data: weekPoints = {} as PointMap } = useMemberPointsSince(weekStartStr)
  const { data: monthPoints = {} as PointMap } = useMemberPointsSince(monthStartStr)

  const ranked = members
    .map((m, i) => ({ m, color: memberColor(i), xp: memberPoints(totals, m.id) }))
    .sort((a, b) => b.xp - a.xp)
  const leader = ranked[0]
  const goal = goals[0]
  const goalCurrent = !goal ? 0
    : goal.period === 'week' ? sumPoints(weekPoints)
    : goal.period === 'month' ? sumPoints(monthPoints)
    : sumPoints(totals)
  const goalPct = goal ? Math.min(100, Math.round((goalCurrent / goal.target_points) * 100)) : 0

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>Tâches</span>
        <Link to="/chores" className={styles.seeAll}>Voir tout</Link>
      </div>
      <Link to="/chores" className={styles.card}>
        {(!leader || leader.xp === 0) && !goal && (
          <div className={styles.line}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span className={styles.muted}>Valide des tâches pour gagner des points</span>
          </div>
        )}
        {leader && leader.xp > 0 && (
          <div className={styles.line}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span className={styles.leader}>👑 {leader.m.display_name}</span>
            <span className={styles.leaderMeta}>
              {levelEmoji(levelForXp(leader.xp).level)} Niv. {levelForXp(leader.xp).level} · {leader.xp} XP
            </span>
          </div>
        )}
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
    </div>
  )
}
