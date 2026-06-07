import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, startOfWeek, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2, BarChart2, Flame, Pencil, Archive, ArchiveRestore, Trophy, MoreHorizontal, ChevronUp, ChevronDown, StickyNote } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { QK } from '../../lib/query-keys'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import {
  useHabits, useArchivedHabits, useRecentCompletions, useYearCompletions,
  useAddHabit, useDeleteHabit, useEditHabit, useToggleCompletion,
  useArchiveHabit, useUnarchiveHabit, useReorderHabits, useUpdateCompletionNote,
  calcStreak, calcBestStreak,
} from './useHabits'
import type { Habit, HabitCompletion } from './useHabits'
import { useHabitsRealtime } from './useHabitsRealtime'
import { memberColor } from '../../lib/constants'
import { capitalize } from '../../lib/utils'
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

/** JS getDay (0=sun…6=sat) → ISO dow (1=mon…7=sun) */
function isoDow(dateStr: string): number {
  const d = new Date(dateStr)
  return d.getDay() === 0 ? 7 : d.getDay()
}

function isApplicable(habit: Habit, dateStr: string): boolean {
  if (habit.start_date && dateStr < habit.start_date) return false
  if (!habit.frequency_days || habit.frequency_days.length === 0) return true
  return habit.frequency_days.includes(isoDow(dateStr))
}

function streakMilestone(streak: number): { emoji: string } | null {
  if (streak >= 365) return { emoji: '🏆' }
  if (streak >= 100) return { emoji: '💎' }
  if (streak >= 60)  return { emoji: '🥇' }
  if (streak >= 30)  return { emoji: '🥈' }
  if (streak >= 21)  return { emoji: '🌟' }
  if (streak >= 14)  return { emoji: '⭐' }
  if (streak >= 7)   return { emoji: '🔥' }
  return null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const { data: currentMember } = useMember()

  const { data: habits = [], isLoading: habitsLoading } = useHabits()
  const { data: archivedHabits = [] } = useArchivedHabits()
  const habitIds = habits.map(h => h.id)
  const { data: completions = [], isLoading: compLoading } = useRecentCompletions(habitIds)
  useHabitsRealtime()

  const addHabit     = useAddHabit()
  const deleteHabit  = useDeleteHabit()
  const editHabit    = useEditHabit()
  const toggle       = useToggleCompletion()
  const archiveHabit = useArchiveHabit()
  const unarchive    = useUnarchiveHabit()
  const reorder      = useReorderHabits()
  const updateNote   = useUpdateCompletionNote()

  function moveHabit(habitId: string, dir: -1 | 1) {
    // Voisin dans la même section (membre) si groupé, sinon dans la liste affichée
    const siblings = grouped
      ? (grouped.find(g => g.items.some(h => h.id === habitId))?.items ?? displayed)
      : displayed
    const visIdx = siblings.findIndex(h => h.id === habitId)
    const neighbor = siblings[visIdx + dir]
    if (!neighbor) return
    const full = habits.slice()
    const a = full.findIndex(h => h.id === habitId)
    const b = full.findIndex(h => h.id === neighbor.id)
    if (a < 0 || b < 0) return
    ;[full[a], full[b]] = [full[b], full[a]]
    reorder.mutate(full.map(h => h.id))
  }

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [editTarget, setEditTarget] = useState<Habit | null>(null)
  const [editDraft,  setEditDraft]  = useState({
    name: '', emoji: '⭐', member_id: null as string | null,
    frequency: 'daily', frequency_days: null as number[] | null, start_date: null as string | null, reminder_time: null as string | null,
  })
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [showAdd,    setShowAdd]    = useState(false)
  const [showStats,  setShowStats]  = useState(false)
  const [statsHabitId, setStatsHabitId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [noteTarget, setNoteTarget] = useState<{ habitId: string; date: string } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const today          = format(new Date(), 'yyyy-MM-dd')
  const yesterday      = format(addDays(new Date(), -1), 'yyyy-MM-dd')
  const isToday        = selectedDate === today
  // eslint-disable-next-line react-hooks/purity
  const MIN_DATE       = format(addDays(new Date(), -60), 'yyyy-MM-dd')
  const dayNavLabel    = isToday ? 'Aujourd\'hui'
    : selectedDate === yesterday ? 'Hier'
    : capitalize(format(new Date(selectedDate + 'T12:00'), 'EEEE d MMM', { locale: fr }))

  const [draft, setDraft] = useState({
    name: '',
    emoji: '⭐',
    member_id: currentMember?.id ?? null as string | null,
    frequency: 'daily',
    frequency_days: null as number[] | null,
    start_date: null as string | null,
    reminder_time: null as string | null,
  })

  const thisWeek = weekDates() // pour le badge x/objectif de la semaine en cours
  // Habitudes applicables au jour sélectionné (jours configurés, ou toujours si quotidienne)
  const displayed = habits.filter(h =>
    (!filterMemberId || h.member_id === filterMemberId) &&
    isApplicable(h, selectedDate)
  )
  const doneSet = new Set(completions.map(c => `${c.habit_id}::${c.date}`))
  function isDone(habitId: string, date: string) { return doneSet.has(`${habitId}::${date}`) }

  const noteMap = new Map(completions.map(c => [`${c.habit_id}::${c.date}`, c.note]))
  function getNote(habitId: string, date: string): string | null { return noteMap.get(`${habitId}::${date}`) ?? null }
  function openNote(habitId: string) {
    setNoteDraft(getNote(habitId, selectedDate) ?? '')
    setNoteTarget({ habitId, date: selectedDate })
  }

  const monthlyRates = useMemo<Record<string, number>>(() => {
    const now      = new Date()
    const todayStr = format(now, 'yyyy-MM-dd')
    const localSet = new Set(completions.map(c => `${c.habit_id}::${c.date}`))
    const rates: Record<string, number> = {}
    for (const h of habits) {
      const days: string[] = []
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      while (true) {
        const ds = format(d, 'yyyy-MM-dd')
        if (ds > todayStr) break
        if (isApplicable(h, ds)) days.push(ds)
        d.setDate(d.getDate() + 1)
      }
      const done = days.filter(ds => localSet.has(`${h.id}::${ds}`)).length
      rates[h.id] = days.length > 0 ? Math.round(done / days.length * 100) : 0
    }
    return rates
  }, [habits, completions])

  // Sections par membre (vue « Tous » avec ≥ 2 membres)
  const grouped = (!filterMemberId && members.length > 1)
    ? (() => {
        const known = new Set(members.map(m => m.id))
        const gs = members
          .map(m => ({ member: m, items: displayed.filter(h => h.member_id === m.id) }))
          .filter(g => g.items.length > 0)
        const others = displayed.filter(h => !h.member_id || !known.has(h.member_id))
        if (others.length) gs.push({ member: { id: '__foyer', display_name: 'Foyer' }, items: others })
        return gs
      })()
    : null

  function renderRow(habit: Habit, i: number, list: Habit[]) {
    const idx    = memberIdx(habit)
    const color  = idx >= 0 ? memberColor(idx) : 'var(--accent)'
    const streak = calcStreak(habit.id, completions)
    const weekDone = thisWeek.filter(d => isApplicable(habit, d) && isDone(habit.id, d)).length
    return (
      <HabitRow
        key={habit.id}
        habit={habit}
        color={color}
        streak={streak}
        monthlyRate={monthlyRates[habit.id]}
        weekDone={weekDone}
        done={isDone(habit.id, selectedDate)}
        hasNote={!!getNote(habit.id, selectedDate)}
        onToggle={() => handleToggle(habit.id)}
        onNote={() => openNote(habit.id)}
        onDelete={() => setConfirmDeleteId(habit.id)}
        onEdit={() => openEdit(habit)}
        onStats={() => { setStatsHabitId(habit.id); setShowStats(true) }}
        onArchive={() => archiveHabit.mutate(habit.id)}
        canReorder={!filterMemberId}
        isFirst={i === 0}
        isLast={i === list.length - 1}
        onMoveUp={() => moveHabit(habit.id, -1)}
        onMoveDown={() => moveHabit(habit.id, 1)}
      />
    )
  }

  function handleToggle(habitId: string) {
    if (selectedDate > today) return
    const done = isDone(habitId, selectedDate)
    toggle.mutate({ habitId, date: selectedDate, done: !done })
  }

  function openEdit(habit: Habit) {
    setEditDraft({
      name: habit.name,
      emoji: habit.emoji,
      member_id: habit.member_id,
      frequency: habit.frequency ?? 'daily',
      frequency_days: habit.frequency_days ?? null,
      start_date: habit.start_date ?? null,
      reminder_time: habit.reminder_time ?? null,
    })
    setEditTarget(habit)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget || !editDraft.name.trim()) return
    const freqDays = editDraft.frequency_days && editDraft.frequency_days.length > 0
      ? editDraft.frequency_days : null
    try {
      await editHabit.mutateAsync({
        id: editTarget.id,
        name: editDraft.name,
        emoji: editDraft.emoji,
        member_id: editDraft.member_id,
        frequency: editDraft.frequency,
        frequency_days: freqDays,
        start_date: editDraft.start_date || null,
        reminder_time: editDraft.reminder_time || null,
      })
      setEditTarget(null)
    } catch { /* onError handles toast */ }
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.name.trim()) return
    if (!draft.member_id && !currentMember) return
    const freqDays = draft.frequency_days && draft.frequency_days.length > 0
      ? draft.frequency_days : null
    try {
      await addHabit.mutateAsync({
        name: draft.name,
        emoji: draft.emoji,
        member_id: draft.member_id ?? currentMember?.id ?? null,
        color: null,
        frequency: draft.frequency,
        frequency_days: freqDays,
        start_date: draft.start_date || null,
        reminder_time: draft.reminder_time || null,
      })
      setDraft({ name: '', emoji: '⭐', member_id: currentMember?.id ?? null, frequency: 'daily', frequency_days: null, start_date: null, reminder_time: null })
      setShowAdd(false)
    } catch { /* onError handles toast */ }
  }

  const isLoading = habitsLoading || (habitIds.length > 0 && compLoading)
  const statsHabit = habits.find(h => h.id === statsHabitId) ?? habits[0] ?? null
  const memberIdx = (habit: Habit) => members.findIndex(m => m.id === habit.member_id)

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

      {/* ── Member filter ─────────────────────────────────────────────── */}
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

      {/* ── Day navigation ───────────────────────────────────────────── */}
      <div className={styles.weekNav}>
        <button
          className={styles.weekNavBtn}
          onClick={() => setSelectedDate(d => format(addDays(new Date(d + 'T12:00'), -1), 'yyyy-MM-dd'))}
          disabled={selectedDate <= MIN_DATE}
          aria-label="Jour précédent"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
        </button>
        <button
          className={[styles.weekNavLabel, isToday ? styles.weekNavLabelCurrent : ''].join(' ')}
          onClick={() => setSelectedDate(today)}
        >
          {dayNavLabel}
        </button>
        <button
          className={styles.weekNavBtn}
          onClick={() => setSelectedDate(d => format(addDays(new Date(d + 'T12:00'), 1), 'yyyy-MM-dd'))}
          disabled={isToday}
          aria-label="Jour suivant"
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

      {/* ── Day summary strip ─────────────────────────────────────────── */}
      {!isLoading && displayed.length > 0 && (() => {
        const done = displayed.filter(h => isDone(h.id, selectedDate)).length
        const total = displayed.length
        const pct = done / total
        const allDone = done === total
        return (
          <div className={styles.todayStrip}>
            <div className={styles.todayStripInfo}>
              <span className={styles.todayStripEmoji}>{allDone ? '🎉' : '🔥'}</span>
              <div>
                <p className={styles.todayStripLabel}>{dayNavLabel}</p>
                <p className={styles.todayStripCount}>{done}/{total}</p>
              </div>
            </div>
            <div className={styles.todayStripRight}>
              <span className={styles.todayStripPct}>{Math.round(pct * 100)}%</span>
              <div className={styles.todayStripTrack}>
                <div
                  className={styles.todayStripFill}
                  style={{ width: `${pct * 100}%`, background: allDone ? '#5B9E8F' : 'var(--accent)' }}
                />
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Day checklist ─────────────────────────────────────────────── */}
      {!isLoading && habits.length > 0 && displayed.length === 0 && (
        <p className={styles.dayEmpty}>Rien de prévu ce jour 🌙</p>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className={styles.habitList}>
          {grouped
            ? grouped.map(g => (
                <div key={g.member.id} className={styles.memberSection}>
                  <p className={styles.memberSectionLabel}>{g.member.display_name}</p>
                  {g.items.map((h, i) => renderRow(h, i, g.items))}
                </div>
              ))
            : displayed.map((h, i) => renderRow(h, i, displayed))
          }
        </div>
      )}

      {/* ── Archived habits ───────────────────────────────────────────── */}
      {archivedHabits.length > 0 && (
        <div className={styles.archivedSection}>
          <button className={styles.archivedToggle} onClick={() => setShowArchived(s => !s)}>
            <Archive size={13} strokeWidth={2} />
            Archivées ({archivedHabits.length})
            <ChevronRight size={13} className={showArchived ? styles.chevronOpen : ''} />
          </button>
          {showArchived && (
            <div className={styles.archivedList}>
              {archivedHabits.map(habit => (
                <div key={habit.id} className={styles.archivedRow}>
                  <span className={styles.archivedName}>{habit.emoji} {habit.name}</span>
                  <button
                    className={styles.unarchiveBtn}
                    onClick={() => unarchive.mutate(habit.id)}
                    disabled={unarchive.isPending}
                  >
                    <ArchiveRestore size={12} strokeWidth={2} />
                    Restaurer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Note modal ────────────────────────────────────────────────── */}
      {noteTarget && (
        <SlideUpModal title="Note du jour" onClose={() => setNoteTarget(null)}>
          <div className={styles.form}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Note sur cette réalisation</label>
              <textarea
                className={styles.noteArea}
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Ex : 3 séries × 15 reps, 30 min de course…"
                rows={4}
                autoFocus
              />
            </div>
            <button
              className={styles.submitBtn}
              onClick={async () => {
                await updateNote.mutateAsync({ habitId: noteTarget.habitId, date: noteTarget.date, note: noteDraft || null })
                setNoteTarget(null)
              }}
              disabled={updateNote.isPending}
            >
              {updateNote.isPending ? 'Enregistrement…' : 'Enregistrer la note'}
            </button>
          </div>
        </SlideUpModal>
      )}

      {/* ── Add habit modal ───────────────────────────────────────────── */}
      {showAdd && (
        <SlideUpModal title="Nouvelle habitude" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAddSubmit} className={styles.form}>
            <HabitForm
              draft={draft}
              setDraft={setDraft}
              members={members}
              isPending={addHabit.isPending}
              submitLabel="Créer"
            />
          </form>
        </SlideUpModal>
      )}

      {/* ── Edit habit modal ──────────────────────────────────────────── */}
      {editTarget && (
        <SlideUpModal title="Modifier l'habitude" onClose={() => setEditTarget(null)}>
          <form onSubmit={handleEditSubmit} className={styles.form}>
            <HabitForm
              draft={editDraft}
              setDraft={setEditDraft}
              members={members}
              isPending={editHabit.isPending}
              submitLabel="Enregistrer"
            />
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

// ── Habit form (shared between add and edit) ──────────────────────────────────

type HabitDraft = {
  name: string
  emoji: string
  member_id: string | null
  frequency: string
  frequency_days: number[] | null
  start_date: string | null
  reminder_time: string | null
}

function HabitForm({ draft, setDraft, members, isPending, submitLabel }: {
  draft: HabitDraft
  setDraft: React.Dispatch<React.SetStateAction<HabitDraft>>
  members: { id: string; display_name: string }[]
  isPending: boolean
  submitLabel: string
}) {
  const usePreciseDays = draft.frequency_days !== null

  function toggleDay(day: number) {
    setDraft(d => {
      const current = d.frequency_days ?? []
      const updated = current.includes(day)
        ? current.filter(x => x !== day)
        : [...current, day].sort((a, b) => a - b)
      return { ...d, frequency_days: updated }
    })
  }

  return (
    <>
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
              className={[styles.freqPill, !usePreciseDays && draft.frequency === opt.value ? styles.freqPillActive : ''].join(' ')}
              onClick={() => setDraft(d => ({ ...d, frequency: opt.value, frequency_days: null }))}
            >{opt.label}</button>
          ))}
          <button
            type="button"
            className={[styles.freqPill, usePreciseDays ? styles.freqPillActive : ''].join(' ')}
            onClick={() => setDraft(d => ({ ...d, frequency_days: d.frequency_days ?? [] }))}
          >Précis</button>
        </div>
        {usePreciseDays && (
          <div className={styles.dayPicker}>
            {WEEK_LABELS.map((label, i) => {
              const day = i + 1
              const selected = (draft.frequency_days ?? []).includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  className={[styles.dayPickerBtn, selected ? styles.dayPickerBtnActive : ''].join(' ')}
                  onClick={() => toggleDay(day)}
                >{label}</button>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Date de début</label>
        <div className={styles.reminderRow}>
          <button
            type="button"
            className={[styles.freqPill, !draft.start_date ? styles.freqPillActive : ''].join(' ')}
            style={{ flexShrink: 0 }}
            onClick={() => setDraft(d => ({ ...d, start_date: null }))}
          >Depuis toujours</button>
          <input
            type="date"
            className={styles.timeInput}
            value={draft.start_date ?? ''}
            onChange={e => setDraft(d => ({ ...d, start_date: e.target.value || null }))}
          />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Rappel push</label>
        <div className={styles.reminderRow}>
          <button
            type="button"
            className={[styles.freqPill, !draft.reminder_time ? styles.freqPillActive : ''].join(' ')}
            style={{ flexShrink: 0 }}
            onClick={() => setDraft(d => ({ ...d, reminder_time: null }))}
          >Aucun</button>
          <input
            type="time"
            className={styles.timeInput}
            value={draft.reminder_time ?? ''}
            onChange={e => setDraft(d => ({ ...d, reminder_time: e.target.value || null }))}
          />
        </div>
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={isPending || !draft.name.trim()}
      >
        {isPending ? 'Enregistrement…' : submitLabel}
      </button>
    </>
  )
}

// ── Habit row ─────────────────────────────────────────────────────────────────

function HabitRow({ habit, color, streak, monthlyRate, weekDone, done, hasNote, onToggle, onNote, onDelete, onEdit, onStats, onArchive, canReorder, isFirst, isLast, onMoveUp, onMoveDown }: {
  habit: Habit
  color: string
  streak: number
  monthlyRate?: number
  weekDone: number
  done: boolean
  hasNote: boolean
  onToggle: () => void
  onNote: () => void
  onDelete: () => void
  onEdit: () => void
  onStats: () => void
  onArchive: () => void
  canReorder: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [showSheet, setShowSheet] = useState(false)

  const target    = habit.frequency_days?.length ?? freqTarget(habit.frequency ?? 'daily')
  const isOnTrack = weekDone >= target
  const nonDaily  = (habit.frequency_days?.length ?? 0) > 0 || (habit.frequency ?? 'daily') !== 'daily'

  return (
    <>
      <div className={styles.habitItem}>
        <span className={styles.rowEmoji}>{habit.emoji}</span>
        <div className={styles.rowMeta}>
          <span className={styles.rowName}>{habit.name}</span>
          <div className={styles.rowStreak}>
            {streakMilestone(streak) ? (
              <span className={styles.milestoneBadge} style={{ color }}>
                {streakMilestone(streak)!.emoji} {streak}j
              </span>
            ) : (
              <>
                <Flame size={10} strokeWidth={2.5} color="#E07B54" />
                <span className={styles.rowStreakVal}>{streak}j</span>
              </>
            )}
            {nonDaily && (
              <span className={[styles.rowFreqBadge, isOnTrack ? styles.rowFreqDone : ''].join(' ')}>
                {weekDone}/{target}
              </span>
            )}
            {monthlyRate !== undefined && (
              <span
                className={styles.monthlyRateBadge}
                style={{ color: monthlyRate >= 80 ? '#5B9E8F' : monthlyRate >= 50 ? 'var(--text-muted)' : '#E07B54' }}
              >
                {monthlyRate}%
              </span>
            )}
            {hasNote && <StickyNote size={11} strokeWidth={2} className={styles.noteIndicator} />}
          </div>
        </div>
        <button
          className={styles.rowMoreBtn}
          onClick={() => setShowSheet(true)}
          aria-label="Actions"
          data-no-feedback
        >
          <MoreHorizontal size={15} strokeWidth={2} />
        </button>
        <button
          className={[styles.habitCheck, done ? styles.habitCheckDone : ''].join(' ')}
          style={done ? { background: color, borderColor: color } : {}}
          onClick={onToggle}
          aria-label={done ? 'Décocher' : 'Cocher'}
          aria-pressed={done}
        >
          {done && <span className={styles.checkMark}>✓</span>}
        </button>
      </div>

      {showSheet && (
        <SlideUpModal
          title={`${habit.emoji} ${habit.name}`}
          onClose={() => setShowSheet(false)}
        >
          <div className={styles.habitSheet}>
            {canReorder && (
              <>
                <button className={styles.habitSheetAction} disabled={isFirst} onClick={() => { onMoveUp(); setShowSheet(false) }}>
                  <ChevronUp size={18} strokeWidth={2} />
                  <span>Monter</span>
                </button>
                <button className={styles.habitSheetAction} disabled={isLast} onClick={() => { onMoveDown(); setShowSheet(false) }}>
                  <ChevronDown size={18} strokeWidth={2} />
                  <span>Descendre</span>
                </button>
              </>
            )}
            <button className={styles.habitSheetAction} onClick={() => { onNote(); setShowSheet(false) }}>
              <StickyNote size={18} strokeWidth={2} />
              <span>{hasNote ? 'Modifier la note du jour' : 'Ajouter une note'}</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onStats(); setShowSheet(false) }}>
              <BarChart2 size={18} strokeWidth={2} />
              <span>Statistiques</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onEdit(); setShowSheet(false) }}>
              <Pencil size={18} strokeWidth={2} />
              <span>Modifier</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onArchive(); setShowSheet(false) }}>
              <Archive size={18} strokeWidth={2} />
              <span>Archiver</span>
            </button>
            <button
              className={[styles.habitSheetAction, styles.habitSheetDanger].join(' ')}
              onClick={() => { onDelete(); setShowSheet(false) }}
            >
              <Trash2 size={18} strokeWidth={2} />
              <span>Supprimer</span>
            </button>
          </div>
        </SlideUpModal>
      )}
    </>
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

  const streak     = calcStreak(habit.id, completions)
  const bestStreak = calcBestStreak(habit.id, yearCompletions)

  const dates = weekDates()
  const doneSet = new Set(completions.filter(c => c.habit_id === habit.id).map(c => c.date))

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

  // Monthly completion trend (12 months of current year)
  const monthlyTrend = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const isFuture = i > now.getMonth()
      if (isFuture) return { label: MONTH_LABELS[i], pct: 0, isFuture: true }
      const prefix   = `${year}-${String(i + 1).padStart(2, '0')}`
      const done     = yearCompletions.filter(c => c.date.startsWith(prefix)).length
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
      const dow = new Date(c.date + 'T12:00').getDay()
      const idx = dow === 0 ? 6 : dow - 1
      totals[idx]++
    }
    return totals
  }, [yearCompletions])
  const maxDayTotal  = Math.max(1, ...dayTotals)
  const bestDayIdx   = dayTotals.indexOf(Math.max(...dayTotals))
  const DAY_NAMES_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

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
          <span className={styles.heatmapLegend}>← moins · plus →</span>
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
                  {week.map((cell, di) => {
                    if (cell === null) return <div key={di} className={styles.heatCell} />
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
      {!yearLoading && yearCompletions.length > 7 && (
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
