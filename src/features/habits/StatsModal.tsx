import { useMemo } from 'react'
import { format, startOfWeek, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Trophy } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import Spinner from '../../components/Spinner'
import { useYearCompletions } from './useHabits'
import type { Habit, HabitCompletion } from './useHabits'
import { WEEK_LABELS, calcBestStreak, calcStreak, freqTarget, isApplicable, weekDates } from './habits.utils'
import { memberColor } from '../../lib/constants'
import styles from './HabitsPage.module.css'

const MONTH_LABELS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
const DAY_NAMES_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

export default function StatsModal({ habit, habits, completions, members, onSelectHabit, onClose }: {
  habit: Habit
  habits: Habit[]
  completions: HabitCompletion[]
  members: { id: string; display_name: string }[]
  onSelectHabit: (id: string) => void
  onClose: () => void
}) {
  const year = new Date().getFullYear()
  // Inclut les lignes partielles (completed=false) pour l'intensité de la
  // heatmap ; tous les calculs filtrent `completed` explicitement.
  const { data: yearCompletions = [], isLoading: yearLoading } = useYearCompletions(habit.id, year)

  const memberIdx = members.findIndex(m => m.id === habit.member_id)
  const color = memberIdx >= 0 ? memberColor(memberIdx) : 'var(--accent)'

  const streak     = calcStreak(habit, completions)
  const bestStreak = calcBestStreak(habit, yearCompletions)

  const dates = weekDates()
  const doneSet = new Set(completions.filter(c => c.habit_id === habit.id && c.completed).map(c => c.date))

  const yearStart = new Date(year, 0, 1)
  const firstMon  = startOfWeek(yearStart, { weekStartsOn: 1 })
  const doneDates = new Set(yearCompletions.filter(c => c.completed).map(c => c.date))
  const rowByDate = new Map(yearCompletions.map(c => [c.date, c]))
  const today     = format(new Date(), 'yyyy-MM-dd')
  const target    = Math.max(1, habit.target_count ?? 1)

  const weeks = Array.from({ length: 53 }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = format(addDays(firstMon, wi * 7 + di), 'yyyy-MM-dd')
      if (d > today || d > `${year}-12-31`) return null
      return d
    })
  ).filter(w => w.some(d => d !== null))

  // Régularité calculée sur les jours où l'habitude était prévue, pas sur
  // tous les jours calendaires (une habitude lun/mer/ven plafonnait à 43 %).
  const allDates        = weeks.flat().filter((d): d is string => d !== null)
  const applicableDates = allDates.filter(d => isApplicable(habit, d))
  const totalDone       = applicableDates.filter(d => doneDates.has(d)).length
  const totalDays       = applicableDates.length
  const pctRegular      = totalDays > 0 ? Math.round(totalDone / totalDays * 100) : 0

  // Monthly completion trend (12 months of current year)
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const isFuture = i > now.getMonth()
      if (isFuture) return { label: MONTH_LABELS[i], pct: 0, isFuture: true }
      const prefix   = `${year}-${String(i + 1).padStart(2, '0')}`
      const done     = yearCompletions.filter(c => c.completed && c.date.startsWith(prefix)).length
      const firstDay = new Date(year, i, 1)
      const endDay   = i === now.getMonth() ? now : new Date(year, i + 1, 0)
      let applicable = 0
      const d = new Date(firstDay)
      while (d <= endDay) {
        if (isApplicable(habit, format(d, 'yyyy-MM-dd'))) applicable++
        d.setDate(d.getDate() + 1)
      }
      return { label: MONTH_LABELS[i], pct: applicable > 0 ? Math.round(done / applicable * 100) : 0, isFuture: false }
    })
  }, [yearCompletions, habit, year])
  const maxMonthPct = Math.max(1, ...monthlyTrend.filter(m => !m.isFuture).map(m => m.pct))

  // Best day of week
  const dayTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0, 0, 0]
    for (const c of yearCompletions) {
      if (!c.completed) continue
      const dow = new Date(c.date + 'T12:00').getDay()
      const idx = dow === 0 ? 6 : dow - 1
      totals[idx]++
    }
    return totals
  }, [yearCompletions])
  const maxDayTotal  = Math.max(1, ...dayTotals)
  const bestDayIdx   = dayTotals.indexOf(Math.max(...dayTotals))

  return (
    <SlideUpModal title="Statistiques" onClose={onClose}>

      <div className={styles.habitSelector}>
        {habits.map(h => {
          const idx    = members.findIndex(m => m.id === h.member_id)
          const c      = idx >= 0 ? memberColor(idx) : 'var(--accent)'
          const active = h.id === habit.id
          return (
            <button
              key={h.id}
              className={[styles.habitSelectorBtn, active ? styles.habitSelectorBtnActive : ''].join(' ')}
              style={active ? { background: `${c}22`, borderColor: c, color: c } : {}}
              onClick={() => onSelectHabit(h.id)}
            >
              <span>{h.emoji}</span> {h.name}
            </button>
          )
        })}
      </div>

      <div className={styles.statCards}>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color }}>{totalDone}<span className={styles.statSub}>/{totalDays}</span></p>
          <p className={styles.statLabel}>Jours fait</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color }}>{pctRegular}<span className={styles.statSub}>%</span></p>
          <p className={styles.statLabel}>Régularité</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color }}>{streak}<span className={styles.statSub}>j</span></p>
          <p className={styles.statLabel}>Série actuelle</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color }}>
            <Trophy size={14} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
            {bestStreak}<span className={styles.statSub}>j</span>
          </p>
          <p className={styles.statLabel}>Meilleure série</p>
        </div>
      </div>

      <div className={styles.heatmapSection}>
        <div className={styles.heatmapHeader}>
          <span className={styles.sectionLabel}>Année {year}</span>
          {target > 1 && <span className={styles.heatmapLegend}>← moins · plus →</span>}
        </div>
        {yearLoading ? (
          <div className={styles.heatmapLoading}><Spinner size={22} /></div>
        ) : (
        <div className={styles.heatmapWrap}>
          <div className={styles.monthAxis}>
            {MONTH_LABELS.map(m => <span key={m}>{m}</span>)}
          </div>
          <div className={styles.heatmapBody}>
            <div className={styles.dowAxis}>
              {['L','','M','','V','',''].map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className={styles.weeksGrid}>
              {weeks.map((week, wi) => (
                <div key={wi} className={styles.weekCol}>
                  {week.map((date, di) => {
                    if (date === null) return <div key={di} className={styles.heatCell} />
                    const row = rowByDate.get(date)
                    if (!row || (!row.completed && row.count <= 0)) {
                      return <div key={di} className={styles.heatCell} title={date} />
                    }
                    // Intensité = progression réelle (compteur/objectif) ;
                    // une habitude simple complétée = pleine intensité.
                    const ratio = row.completed ? 1 : Math.min(1, row.count / target)
                    return (
                      <div
                        key={di}
                        className={styles.heatCell}
                        style={{ background: color, opacity: 0.3 + 0.7 * ratio }}
                        title={target > 1 ? `${date} · ${row.count}/${target}` : date}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {!yearLoading && (() => {
        const weekTarget = habit.frequency_days?.length ?? freqTarget(habit.frequency ?? 'daily')
        const last4 = Array.from({ length: 4 }, (_, i) => {
          const wStart = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -(3 - i) * 7)
          const days   = Array.from({ length: 7 }, (_, d) => format(addDays(wStart, d), 'yyyy-MM-dd'))
          const count  = days.filter(d => doneDates.has(d)).length
          const pct    = Math.min(100, Math.round(count / weekTarget * 100))
          return { label: format(wStart, 'd MMM', { locale: fr }), count, pct }
        })
        return (
          <div className={styles.weekBarsSection}>
            <p className={styles.sectionLabel}>4 dernières semaines</p>
            <div className={styles.weekProgressBars}>
              {last4.map((w, i) => (
                <div key={i} className={styles.weekProgressWrap}>
                  <div className={styles.weekProgressTrack}>
                    <div
                      className={styles.weekProgressFill}
                      style={{ height: `${w.pct}%`, background: color }}
                    />
                  </div>
                  <span className={styles.weekProgressPct}>{w.pct}%</span>
                  <span className={styles.weekProgressLabel}>{w.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div className={styles.weekBarsSection}>
        <p className={styles.sectionLabel}>Cette semaine</p>
        <div className={styles.weekBars}>
          {dates.map((date, i) => {
            const done = doneSet.has(date)
            return (
              <div key={i} className={styles.weekBarWrap}>
                <div
                  className={styles.weekBar}
                  style={{ height: done ? 44 : 8, background: done ? color : 'var(--border)' }}
                />
                <span className={styles.weekBarLabel}>{WEEK_LABELS[i]}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Monthly trend */}
      {!yearLoading && (
        <div className={styles.weekBarsSection}>
          <p className={styles.sectionLabel}>Taux de complétion par mois</p>
          <div className={styles.monthBars}>
            {monthlyTrend.map((m, i) => (
              <div key={i} className={styles.monthBarWrap}>
                <div
                  className={styles.monthBar}
                  style={{
                    height: m.isFuture ? 2 : Math.max(2, (m.pct / maxMonthPct) * 52),
                    background: m.isFuture
                      ? 'var(--border)'
                      : m.pct >= 80 ? '#5B9E8F'
                      : m.pct >= 50 ? color
                      : '#E07B54',
                    opacity: m.isFuture ? 0.3 : 1,
                  }}
                />
                {!m.isFuture && m.pct > 0 && (
                  <span className={styles.monthBarPct}>{m.pct}%</span>
                )}
                <span className={styles.monthBarLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best day of week */}
      {!yearLoading && doneDates.size > 7 && (
        <div className={styles.weekBarsSection}>
          <div className={styles.bestDayHeader}>
            <p className={styles.sectionLabel}>Par jour de la semaine</p>
            <span className={styles.bestDayName}>
              Meilleur : {DAY_NAMES_FR[bestDayIdx]}
            </span>
          </div>
          <div className={styles.bestDayBars}>
            {dayTotals.map((count, i) => (
              <div key={i} className={styles.monthBarWrap}>
                <div
                  className={styles.monthBar}
                  style={{
                    height: Math.max(2, (count / maxDayTotal) * 36),
                    background: i === bestDayIdx ? color : 'var(--border)',
                  }}
                />
                <span className={[styles.monthBarLabel, i === bestDayIdx ? styles.bestDayLabelActive : ''].join(' ')}>
                  {WEEK_LABELS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </SlideUpModal>
  )
}
