import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, addDays } from 'date-fns'
import { ChevronLeft, Plus, X, Trash2, BarChart2, Flame } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import {
  useHabits, useRecentCompletions, useYearCompletions,
  useAddHabit, useDeleteHabit, useToggleCompletion, calcStreak,
} from './useHabits'
import { useHabitsRealtime } from './useHabitsRealtime'
import type { Habit, HabitCompletion } from './useHabits'
import styles from './HabitsPage.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const MEMBER_PALETTE = ['#E07B54', '#5B9E8F', '#9B7AC4', '#E8B84B']
const WEEK_LABELS    = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const EMOJI_PALETTE  = ['⭐','🏃','📚','💧','🧘','🥗','😴','🎵','✍️','🌿','💊','🏋️','🎯','🚲','🧹']

function memberColor(index: number) { return MEMBER_PALETTE[index % MEMBER_PALETTE.length] }

// Current week: Monday → Sunday
function weekDates(): string[] {
  const mon = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(mon, i), 'yyyy-MM-dd'))
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const { data: currentMember } = useMember()

  const { data: habits = [], isLoading: habitsLoading } = useHabits()
  const habitIds = habits.map(h => h.id)
  const { data: completions = [], isLoading: compLoading } = useRecentCompletions(habitIds)
  useHabitsRealtime()

  const addHabit    = useAddHabit()
  const deleteHabit = useDeleteHabit()
  const toggle      = useToggleCompletion()

  // Member list for filter + add modal
  const { data: members = [] } = useQuery({
    queryKey: ['members-list', HOUSEHOLD_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [showAdd,   setShowAdd]   = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [statsHabitId, setStatsHabitId] = useState<string | null>(null)

  // Add form
  const [draft, setDraft] = useState({
    name: '',
    emoji: '⭐',
    member_id: currentMember?.id ?? null as string | null,
  })

  const displayed = filterMemberId
    ? habits.filter(h => h.member_id === filterMemberId)
    : habits

  const dates = weekDates()
  const doneSet = new Set(completions.map(c => `${c.habit_id}::${c.date}`))
  function isDone(habitId: string, date: string) { return doneSet.has(`${habitId}::${date}`) }

  function handleToggle(habitId: string, date: string) {
    toggle.mutate({ habitId, date, done: !isDone(habitId, date) })
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    const firstMemberId = members[0]?.id ?? null
    await addHabit.mutateAsync({
      name: draft.name,
      emoji: draft.emoji,
      member_id: draft.member_id ?? firstMemberId,
      color: null,
    })
    setDraft({ name: '', emoji: '⭐', member_id: currentMember?.id ?? firstMemberId })
    setShowAdd(false)
  }

  const isLoading = habitsLoading || (habitIds.length > 0 && compLoading)

  const statsHabit = habits.find(h => h.id === statsHabitId) ?? habits[0] ?? null
  const memberIdx = (habit: Habit) =>
    members.findIndex(m => m.id === habit.member_id)

  return (
    <div className={styles.page}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Habitudes</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.statsBtn}
            onClick={() => { setStatsHabitId(habits[0]?.id ?? null); setShowStats(true) }}
            disabled={habits.length === 0}
          >
            <BarChart2 size={14} strokeWidth={2} />
            Stats
          </button>
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
            <Plus size={14} strokeWidth={2.5} />
            Nouvelle
          </button>
        </div>
      </header>

      {/* ── Member filter ────────────────────────────────────────────── */}
      <div className={styles.filterRow}>
        <button
          className={[styles.filterPill, !filterMemberId ? styles.filterPillActive : ''].join(' ')}
          style={!filterMemberId ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
          onClick={() => setFilterMemberId(null)}
        >Tous</button>
        {members.map((m, i) => {
          const active = filterMemberId === m.id
          const color  = memberColor(i)
          return (
            <button
              key={m.id}
              className={[styles.filterPill, active ? styles.filterPillActive : ''].join(' ')}
              style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
              onClick={() => setFilterMemberId(active ? null : m.id)}
            >{m.display_name}</button>
          )
        })}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {isLoading && (
        <div className={styles.spinnerWrap}><Spinner size={32} /></div>
      )}

      {!isLoading && habits.length === 0 && (
        <EmptyState
          emoji="🔥"
          title="Aucune habitude"
          description="Crée ta première habitude pour commencer le suivi."
          action={{ label: 'Créer une habitude', onClick: () => setShowAdd(true) }}
        />
      )}

      {!isLoading && habits.length > 0 && (
        <div className={styles.grid}>
          {/* Week header */}
          <div className={styles.gridHeader}>
            <div className={styles.gridHeaderLabel}>Habitude</div>
            {WEEK_LABELS.map((d, i) => {
              const isToday = dates[i] === format(new Date(), 'yyyy-MM-dd')
              return (
                <div key={i} className={[styles.dayLabel, isToday ? styles.dayLabelToday : ''].join(' ')}>
                  {d}
                </div>
              )
            })}
          </div>

          {/* Habit rows */}
          {displayed.map(habit => {
            const idx    = memberIdx(habit)
            const color  = idx >= 0 ? memberColor(idx) : 'var(--accent)'
            const streak = calcStreak(habit.id, completions)
            return (
              <HabitRow
                key={habit.id}
                habit={habit}
                color={color}
                streak={streak}
                dates={dates}
                isDone={date => isDone(habit.id, date)}
                onToggle={date => handleToggle(habit.id, date)}
                onDelete={() => deleteHabit.mutate(habit.id)}
                onStats={() => { setStatsHabitId(habit.id); setShowStats(true) }}
              />
            )
          })}
        </div>
      )}

      {/* ── Add habit modal ───────────────────────────────────────────── */}
      {showAdd && (
        <div className={styles.overlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.dragHandle} />
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Nouvelle habitude</h2>
              <button className={styles.closeBtn} onClick={() => setShowAdd(false)}><X size={18} strokeWidth={2.5} /></button>
            </div>
            <form onSubmit={handleAddSubmit} className={styles.form}>
              <div className={styles.fieldGroup}>
                <label htmlFor="h-name" className={styles.fieldLabel}>Nom</label>
                <input
                  id="h-name"
                  type="text"
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className={styles.input}
                  placeholder="Ex: Boire 2L d'eau"
                  required
                  autoFocus
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Emoji</label>
                <div className={styles.emojiGrid}>
                  {EMOJI_PALETTE.map(e => (
                    <button
                      key={e}
                      type="button"
                      className={[styles.emojiBtn, draft.emoji === e ? styles.emojiBtnActive : ''].join(' ')}
                      style={draft.emoji === e ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.12)' } : {}}
                      onClick={() => setDraft(d => ({ ...d, emoji: e }))}
                    >{e}</button>
                  ))}
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Membre</label>
                <div className={styles.memberPills}>
                  {members.map((m, i) => {
                    const active = draft.member_id === m.id
                    const color  = memberColor(i)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={[styles.memberPill, active ? styles.memberPillActive : ''].join(' ')}
                        style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                        onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                      >{m.display_name}</button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={addHabit.isPending || !draft.name.trim()}
              >
                {addHabit.isPending ? 'Création…' : 'Créer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Stats modal ───────────────────────────────────────────────── */}
      {showStats && statsHabit && (
        <StatsModal
          habit={statsHabit}
          habits={habits}
          completions={completions}
          members={members}
          onSelectHabit={id => setStatsHabitId(id)}
          onClose={() => setShowStats(false)}
        />
      )}

    </div>
  )
}

// ── Habit row ─────────────────────────────────────────────────────────────────

function HabitRow({ habit, color, streak, dates, isDone, onToggle, onDelete, onStats }: {
  habit: Habit
  color: string
  streak: number
  dates: string[]
  isDone: (date: string) => boolean
  onToggle: (date: string) => void
  onDelete: () => void
  onStats: () => void
}) {
  return (
    <div className={styles.row}>
      {/* Habit info */}
      <div className={styles.rowInfo}>
        <span className={styles.rowEmoji}>{habit.emoji}</span>
        <div className={styles.rowMeta}>
          <span className={styles.rowName}>{habit.name}</span>
          <div className={styles.rowStreak}>
            <Flame size={10} strokeWidth={2.5} color="#E07B54" />
            <span className={styles.rowStreakVal}>{streak}j</span>
          </div>
        </div>
        <div className={styles.rowActions}>
          <button className={styles.rowActionBtn} onClick={onStats} aria-label="Stats"><BarChart2 size={12} strokeWidth={2} /></button>
          <button className={styles.rowActionBtn} onClick={onDelete} aria-label="Supprimer"><Trash2 size={12} strokeWidth={2} /></button>
        </div>
      </div>

      {/* Day checkboxes */}
      {dates.map(date => {
        const done    = isDone(date)
        const isToday = date === format(new Date(), 'yyyy-MM-dd')
        return (
          <button
            key={date}
            className={[
              styles.dayCell,
              done ? styles.dayCellDone : '',
              isToday ? styles.dayCellToday : '',
            ].join(' ')}
            style={done ? { background: color } : isToday ? { borderColor: color } : {}}
            onClick={() => onToggle(date)}
            aria-label={`${done ? 'Décocher' : 'Cocher'} ${date}`}
          >
            {done && <span className={styles.checkMark}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Stats modal ───────────────────────────────────────────────────────────────

function StatsModal({ habit, habits, completions, members, onSelectHabit, onClose }: {
  habit: Habit
  habits: Habit[]
  completions: HabitCompletion[]
  members: { id: string; display_name: string }[]
  onSelectHabit: (id: string) => void
  onClose: () => void
}) {
  const year = new Date().getFullYear()
  const { data: yearCompletions = [] } = useYearCompletions(habit.id, year)

  const memberIdx = members.findIndex(m => m.id === habit.member_id)
  const color = memberIdx >= 0 ? memberColor(memberIdx) : 'var(--accent)'

  // Streak from recent completions
  const streak = calcStreak(habit.id, completions)

  // Week completion for current week
  const dates = weekDates()
  const doneSet = new Set(completions.filter(c => c.habit_id === habit.id).map(c => c.date))

  // Year heatmap: 52 weeks × 7 days
  const yearStart = new Date(year, 0, 1)
  const firstMon  = startOfWeek(yearStart, { weekStartsOn: 1 })
  const doneDates = new Set(yearCompletions.map(c => c.date))
  const today     = format(new Date(), 'yyyy-MM-dd')

  const weeks = Array.from({ length: 53 }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = format(addDays(firstMon, wi * 7 + di), 'yyyy-MM-dd')
      if (d > today || d > `${year}-12-31`) return null
      return { date: d, done: doneDates.has(d) }
    })
  ).filter(w => w.some(d => d !== null))

  const allDays    = weeks.flat().filter(d => d !== null) as { date: string; done: boolean }[]
  const totalDone  = allDays.filter(d => d.done).length
  const totalDays  = allDays.length
  const pctRegular = totalDays > 0 ? Math.round(totalDone / totalDays * 100) : 0

  const MONTH_LABELS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.dragHandle} />
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Statistiques</h2>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} strokeWidth={2.5} /></button>
        </div>

        {/* Habit selector */}
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

        {/* Stat cards */}
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
            <p className={styles.statLabel}>Série en cours</p>
          </div>
        </div>

        {/* Heatmap */}
        <div className={styles.heatmapSection}>
          <div className={styles.heatmapHeader}>
            <span className={styles.sectionLabel}>Année {year}</span>
            <span className={styles.heatmapLegend}>← moins · plus →</span>
          </div>
          <div className={styles.heatmapWrap}>
            {/* Month axis */}
            <div className={styles.monthAxis}>
              {MONTH_LABELS.map(m => <span key={m}>{m}</span>)}
            </div>
            <div className={styles.heatmapBody}>
              {/* Day-of-week axis */}
              <div className={styles.dowAxis}>
                {['L','','M','','V','',''].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              {/* Weeks */}
              <div className={styles.weeksGrid}>
                {weeks.map((week, wi) => (
                  <div key={wi} className={styles.weekCol}>
                    {week.map((cell, di) => {
                      if (cell === null) return <div key={di} className={styles.heatCell} />
                      return (
                        <div
                          key={di}
                          className={styles.heatCell}
                          style={cell.done ? { background: color, opacity: 0.7 + Math.random() * 0.3 } : {}}
                          title={cell.date}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly bars */}
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

      </div>
    </div>
  )
}
