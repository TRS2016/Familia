import { fmtClock } from './training'
import type { TrainingStats } from './useTraining'
import styles from './TrainingPage.module.css'

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export default function StatsCard({ stats, goal, onEditGoal }: { stats: TrainingStats; goal: number; onEditGoal: () => void }) {
  const maxSec = Math.max(1, ...stats.perDay.map(d => d.seconds))
  const todayKey = stats.perDay[stats.perDay.length - 1]?.date

  // Anneau d'objectif hebdo
  const G = { size: 46, r: 19 }
  const GC = 2 * Math.PI * G.r
  const goalPct = goal > 0 ? Math.min(1, stats.weekCount / goal) : 0
  const goalMet = goal > 0 && stats.weekCount >= goal
  const goalColor = goalMet ? 'var(--tr-ok)' : 'var(--tr-accent)'

  return (
    <div className={styles.statsCard}>
      <div className={styles.statsGrid}>
        <button className={[styles.statCell, styles.statCellGoal].join(' ')} onClick={onEditGoal} aria-label="Objectif hebdomadaire">
          <span className={styles.goalRing}>
            <svg viewBox={`0 0 ${G.size} ${G.size}`} className={styles.goalRingSvg}>
              <circle cx={G.size / 2} cy={G.size / 2} r={G.r} fill="none" stroke="var(--tr-line)" strokeWidth={4} />
              <circle cx={G.size / 2} cy={G.size / 2} r={G.r} fill="none"
                stroke={goalColor} strokeWidth={4} strokeLinecap="round"
                strokeDasharray={GC} strokeDashoffset={GC * (1 - goalPct)}
                transform={`rotate(-90 ${G.size / 2} ${G.size / 2})`}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </svg>
            <span className={styles.goalRingText} style={{ color: goalColor }}>
              {stats.weekCount}<span className={styles.goalRingDen}>/{goal}</span>
            </span>
          </span>
          <span className={styles.statLabel}>Objectif</span>
        </button>
        <div className={styles.statCell}>
          <span className={styles.statValue}>{fmtClock(stats.weekSeconds)}</span>
          <span className={styles.statLabel}>Temps</span>
        </div>
        <div className={styles.statCell}>
          <span className={[styles.statValue, stats.streakDays > 0 ? styles.statValueAccent : ''].join(' ')}>
            {stats.streakDays > 0 ? `${stats.streakDays}🔥` : '0'}
          </span>
          <span className={styles.statLabel}>Série</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statValue}>{stats.totalCount}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>

      <div className={styles.statChart}>
        {stats.perDay.map(d => {
          const dow = new Date(d.date + 'T00:00:00').getDay()
          const isToday = d.date === todayKey
          return (
            <div key={d.date} className={styles.statBarCol}>
              <div className={styles.statBarTrack}>
                <div
                  className={[styles.statBar, d.seconds === 0 ? styles.statBarEmpty : ''].join(' ')}
                  style={{ height: `${Math.round((d.seconds / maxSec) * 100)}%` }}
                />
              </div>
              <span className={[styles.statBarDay, isToday ? styles.statBarDayToday : ''].join(' ')}>
                {DAY_LETTERS[dow]}
              </span>
            </div>
          )
        })}
      </div>

      {stats.zones.length > 0 && (
        <div className={styles.statZones}>
          {stats.zones.map(z => (
            <span key={z.focus} className={styles.statZone}>
              {z.focus}<span className={styles.statZoneCount}>{z.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
