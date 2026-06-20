import { Link } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { MEMBER_PALETTE } from '../../lib/constants'
import { usePointEvents, useFamilyGoals, totalsByMember, periodStart, pointsSince } from './useGamification'
import { levelForXp, levelEmoji } from './achievements'

interface Props {
  members: { id: string; display_name: string }[]
}

/** Widget Home compact : meneur du classement + progression de l'objectif. */
export default function ChoresHomeWidget({ members }: Props) {
  const { data: events = [] } = usePointEvents()
  const { data: goals = [] } = useFamilyGoals()

  const totals = totalsByMember(events)
  const ranked = members
    .map((m, i) => ({ m, color: MEMBER_PALETTE[i % MEMBER_PALETTE.length], xp: totals.get(m.id) ?? 0 }))
    .sort((a, b) => b.xp - a.xp)
  const leader = ranked[0]
  const goal = goals[0]
  const goalCurrent = goal ? pointsSince(events, periodStart(goal)) : 0
  const goalPct = goal ? Math.min(100, Math.round((goalCurrent / goal.target_points) * 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Tâches</span>
        <Link to="/chores" style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 12, textDecoration: 'none' }}>Voir tout</Link>
      </div>
      <Link to="/chores" style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
        borderRadius: 16, background: 'var(--bg-card, #fff)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        textDecoration: 'none', color: 'inherit',
      }}>
        {(!leader || leader.xp === 0) && !goal && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span style={{ fontSize: 13, color: 'var(--text-muted, #888)', fontWeight: 700 }}>
              Valide des tâches pour gagner des points
            </span>
          </div>
        )}
        {leader && leader.xp > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ListChecks size={15} color="#E07B54" strokeWidth={2.5} />
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
              👑 {leader.m.display_name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted, #888)', fontWeight: 700 }}>
              {levelEmoji(levelForXp(leader.xp).level)} Niv. {levelForXp(leader.xp).level} · {leader.xp} XP
            </span>
          </div>
        )}
        {goal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>🎯 {goal.label}</span>
              <span style={{ color: 'var(--text-muted, #888)', fontWeight: 700 }}>{goalCurrent}/{goal.target_points}</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--bg-input)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${goalPct}%`, background: 'var(--accent)', borderRadius: 99 }} />
            </div>
          </div>
        )}
      </Link>
    </div>
  )
}
