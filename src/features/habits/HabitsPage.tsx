import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2, BarChart2, Flame, Pencil } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { QK } from '../../lib/query-keys'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import {
  useHabits, useRecentCompletions, useYearCompletions,
  useAddHabit, useDeleteHabit, useEditHabit, useToggleCompletion, calcStreak,
} from './useHabits'
import type { Habit, HabitCompletion } from './useHabits'
import { useHabitsRealtime } from './useHabitsRealtime'
import { memberColor } from '../../lib/constants'
import styles from './HabitsPage.module.css'

const WEEK_LABELS   = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const EMOJI_PALETTE = ['⭐','🏃','📚','💧','🧘','🥗','😴','🎵','✍️','🌿','💊','🏋️','🎯','🚲','🧹']

const FREQ_OPTS = [
  { value: 'daily', label: 'Quotidien' },
  { value: '3x',    label: '3×/sem.' },
  { value: '2x',    label: '2×/sem.' },
  { value: '1x',    label: '1×/sem.' },
]

function weekDates(): string[] {
  const mon = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(mon, i), 'yyyy-MM-dd'))
}

function freqTarget(frequency: string): number {
  if (frequency === '3x') return 3
  if (frequency === '2x') return 2
  if (frequency === '1x') return 1
  return 7
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
  const editHabit   = useEditHabit()
  const toggle      = useToggleCompletion()

  // Member list for filter + add modal
  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [editTarget, setEditTarget] = useState<Habit | null>(null)
  const [editDraft,  setEditDraft]  = useState({ name: '', emoji: '⭐', member_id: null as string | null, frequency: 'daily' })
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [showAdd,   setShowAdd]   = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [statsHabitId, setStatsHabitId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const today          = format(new Date(), 'yyyy-MM-dd')
  const currentWeekStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const isCurrentWeek  = format(weekCursor, 'yyyy-MM-dd') === currentWeekStr
  const MIN_WEEK_STR   = format(startOfWeek(new Date(Date.now() - 56 * 24 * 60 * 60 * 1000), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekNavLabel   = `${format(weekCursor, 'd MMM', { locale: fr })} – ${format(addDays(weekCursor, 6), 'd MMM', { locale: fr })}`

  // Add form
  const [draft, setDraft] = useState({
    name: '',
    emoji: '⭐',
    member_id: currentMember?.id ?? null as string | null,
    frequency: 'daily',
  })

  const displayed = filterMemberId
    ? habits.filter(h => h.member_id === filterMemberId)
    : habits

  const dates = Array.from({ length: 7 }, (_, i) => format(addDays(weekCursor, i), 'yyyy-MM-dd'))
  const doneSet = new Set(completions.map(c => `${c.habit_id}::${c.date}`))
  function isDone(habitId: string, date: string) { return doneSet.has(`${habitId}::${date}`) }

  function handleToggle(habitId: string, date: string) {
    if (date > today) return
    toggle.mutate({ habitId, date, done: !isDone(habitId, date) })
  }

  function openEdit(habit: Habit) {
    setEditDraft({ name: habit.name, emoji: habit.emoji, member_id: habit.member_id, frequency: habit.frequency ?? 'daily' })
    setEditTarget(habit)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget || !editDraft.name.trim()) return
    await editHabit.mutateAsync({ id: editTarget.id, ...editDraft })
    setEditTarget(null)
  }

  /**
   * On compte sur RequireMember pour que currentMember soit chargé avant le rendu.
   * Si draft.member_id et currentMember sont tous deux null, c'est une anomalie : on abort.
   */
  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    if (!draft.member_id && !currentMember) {
      console.error('[HabitsPage] handleAddSubmit: currentMember est null, impossible de créer l\'habitude')
      return
    }
    await addHabit.mutateAsync({
      name: draft.name,
      emoji: draft.emoji,
      member_id: draft.member_id ?? currentMember?.id ?? null,
      color: null,
      frequency: draft.frequency,
    })
    setDraft({ name: '', emoji: '⭐', member_id: currentMember?.id ?? null, frequency: 'daily' })
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

      {/* ── Member filter + week navigation ─────────────────────────── */}
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

      {/* ── Week navigation ──────────────────────────────────────────── */}
      <div className={styles.weekNav}>
        <button
          className={styles.weekNavBtn}
          onClick={() => setWeekCursor(w => addDays(w, -7))}
          disabled={format(weekCursor, 'yyyy-MM-dd') <= MIN_WEEK_STR}
          aria-label="Semaine précédente"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
        </button>
        <button
          className={[styles.weekNavLabel, isCurrentWeek ? styles.weekNavLabelCurrent : ''].join(' ')}
          onClick={() => setWeekCursor(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        >
          {isCurrentWeek ? 'Cette semaine' : weekNavLabel}
        </button>
        <button
          className={styles.weekNavBtn}
          onClick={() => setWeekCursor(w => addDays(w, 7))}
          disabled={isCurrentWeek}
          aria-label="Semaine suivante"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>
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
                today={today}
                isDone={date => isDone(habit.id, date)}
                onToggle={date => handleToggle(habit.id, date)}
                onDelete={() => setConfirmDeleteId(habit.id)}
                onEdit={() => openEdit(habit)}
                onStats={() => { setStatsHabitId(habit.id); setShowStats(true) }}
              />
            )
          })}
        </div>
      )}

      {/* ── Add habit modal ───────────────────────────────────────────── */}
      {showAdd && (
        <SlideUpModal title="Nouvelle habitude" onClose={() => setShowAdd(false)}>
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

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Fréquence</label>
                <div className={styles.freqPills}>
                  {FREQ_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={[styles.freqPill, draft.frequency === opt.value ? styles.freqPillActive : ''].join(' ')}
                      onClick={() => setDraft(d => ({ ...d, frequency: opt.value }))}
                    >{opt.label}</button>
                  ))}
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
        </SlideUpModal>
      )}

      {/* ── Edit habit modal ──────────────────────────────────────────── */}
      {editTarget && (
        <SlideUpModal title="Modifier l'habitude" onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEditSubmit} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="eh-name" className={styles.fieldLabel}>Nom</label>
              <input
                id="eh-name"
                type="text"
                value={editDraft.name}
                onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                className={styles.input}
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
                    className={[styles.emojiBtn, editDraft.emoji === e ? styles.emojiBtnActive : ''].join(' ')}
                    style={editDraft.emoji === e ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.12)' } : {}}
                    onClick={() => setEditDraft(d => ({ ...d, emoji: e }))}
                  >{e}</button>
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Membre</label>
              <div className={styles.memberPills}>
                {members.map((m, i) => {
                  const active = editDraft.member_id === m.id
                  const color  = memberColor(i)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={[styles.memberPill, active ? styles.memberPillActive : ''].join(' ')}
                      style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                      onClick={() => setEditDraft(d => ({ ...d, member_id: m.id }))}
                    >{m.display_name}</button>
                  )
                })}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Fréquence</label>
              <div className={styles.freqPills}>
                {FREQ_OPTS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={[styles.freqPill, editDraft.frequency === opt.value ? styles.freqPillActive : ''].join(' ')}
                    onClick={() => setEditDraft(d => ({ ...d, frequency: opt.value }))}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={editHabit.isPending || !editDraft.name.trim()}
            >
              {editHabit.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </SlideUpModal>
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

      {/* ── Confirmation suppression ──────────────────────────────────── */}
      {confirmDeleteId && (() => {
        const target = habits.find(h => h.id === confirmDeleteId)
        return (
          <SlideUpModal title="Supprimer l'habitude ?" onClose={() => setConfirmDeleteId(null)}>
            <div className={styles.form}>
              <p className={styles.confirmText}>
                « {target?.emoji} {target?.name} » sera supprimée définitivement ainsi que tout son historique.
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.cancelBtn} onClick={() => setConfirmDeleteId(null)}>
                  Annuler
                </button>
                <button
                  className={styles.dangerBtn}
                  disabled={deleteHabit.isPending}
                  onClick={() => {
                    deleteHabit.mutate(confirmDeleteId)
                    setConfirmDeleteId(null)
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </SlideUpModal>
        )
      })()}

    </div>
  )
}

// ── Habit row ─────────────────────────────────────────────────────────────────

function HabitRow({ habit, color, streak, dates, today, isDone, onToggle, onDelete, onEdit, onStats }: {
  habit: Habit
  color: string
  streak: number
  dates: string[]
  today: string
  isDone: (date: string) => boolean
  onToggle: (date: string) => void
  onDelete: () => void
  onEdit: () => void
  onStats: () => void
}) {
  const weekDone  = dates.filter(d => isDone(d)).length
  const target    = freqTarget(habit.frequency ?? 'daily')
  const isOnTrack = weekDone >= target
  const nonDaily  = (habit.frequency ?? 'daily') !== 'daily'

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
            {nonDaily && (
              <span className={[styles.rowFreqBadge, isOnTrack ? styles.rowFreqDone : ''].join(' ')}>
                {weekDone}/{target}
              </span>
            )}
          </div>
        </div>
        <div className={styles.rowActions}>
          <button className={styles.rowActionBtn} onClick={onStats} aria-label="Stats"><BarChart2 size={12} strokeWidth={2} /></button>
          <button className={styles.rowActionBtn} onClick={onEdit} aria-label="Modifier"><Pencil size={12} strokeWidth={2} /></button>
          <button className={styles.rowActionBtn} onClick={onDelete} aria-label="Supprimer"><Trash2 size={12} strokeWidth={2} /></button>
        </div>
      </div>

      {/* Day checkboxes */}
      {dates.map(date => {
        const done     = isDone(date)
        const isToday  = date === today
        const isFuture = date > today
        return (
          <button
            key={date}
            className={[
              styles.dayCell,
              done ? styles.dayCellDone : '',
              isToday ? styles.dayCellToday : '',
              isFuture ? styles.dayCellFuture : '',
            ].join(' ')}
            style={done ? { background: color } : isToday ? { borderColor: color } : {}}
            onClick={() => !isFuture && onToggle(date)}
            disabled={isFuture}
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
  const { data: yearCompletions = [], isLoading: yearLoading } = useYearCompletions(habit.id, year)

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
    <SlideUpModal title="Statistiques" onClose={onClose}>

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
          {yearLoading ? (
            <div className={styles.heatmapLoading}><Spinner size={22} /></div>
          ) : (
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
                      // Deterministic opacity from date string to avoid flicker on re-render
                      const seed = cell.date.split('-').reduce((n, s) => n + parseInt(s), 0)
                      return (
                        <div
                          key={di}
                          className={styles.heatCell}
                          style={cell.done ? { background: color, opacity: 0.55 + (seed % 10) * 0.045 } : {}}
                          title={cell.date}
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

        {/* 4-week progress */}
        {!yearLoading && (() => {
          const weekTarget = freqTarget(habit.frequency ?? 'daily')
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

    </SlideUpModal>
  )
}
