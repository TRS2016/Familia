import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, BarChart2, Archive, ArchiveRestore } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { QK } from '../../lib/query-keys'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import {
  useHabits, useArchivedHabits, useRecentCompletions,
  useAddHabit, useDeleteHabit, useEditHabit,
  useArchiveHabit, useUnarchiveHabit, useReorderHabits, useUpdateCompletionNote, useSetCount,
} from './useHabits'
import type { Habit } from './useHabits'
import { useHabitsRealtime } from './useHabitsRealtime'
import { calcStreak, isApplicable, weekDates } from './habits.utils'
import HabitForm from './HabitForm'
import HabitRow from './HabitRow'
import StatsModal from './StatsModal'
import { memberColor } from '../../lib/constants'
import { capitalize } from '../../lib/utils'
import styles from './HabitsPage.module.css'

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
  const archiveHabit = useArchiveHabit()
  const unarchive    = useUnarchiveHabit()
  const reorder      = useReorderHabits()
  const updateNote   = useUpdateCompletionNote()
  const setCount     = useSetCount()

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
    name: '', emoji: '⭐', member_id: null as string | null, kind: 'do' as 'do' | 'avoid', target_count: 1,
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
   
  const MIN_DATE       = format(addDays(new Date(), -60), 'yyyy-MM-dd')
   
  const MAX_DATE       = format(addDays(new Date(), 60), 'yyyy-MM-dd')
  const isFuture       = selectedDate > today
  const dayNavLabel    = isToday ? 'Aujourd\'hui'
    : selectedDate === yesterday ? 'Hier'
    : capitalize(format(new Date(selectedDate + 'T12:00'), 'EEEE d MMM', { locale: fr }))

  const [draft, setDraft] = useState({
    name: '',
    emoji: '⭐',
    member_id: currentMember?.id ?? null as string | null,
    kind: 'do' as 'do' | 'avoid',
    target_count: 1,
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
  const doneSet = new Set(completions.filter(c => c.completed).map(c => `${c.habit_id}::${c.date}`))
  function isDone(habitId: string, date: string) { return doneSet.has(`${habitId}::${date}`) }

  const countMap = new Map(completions.map(c => [`${c.habit_id}::${c.date}`, c.count]))
  function getCount(habitId: string, date: string): number { return countMap.get(`${habitId}::${date}`) ?? 0 }

  const noteMap = new Map(completions.map(c => [`${c.habit_id}::${c.date}`, c.note]))
  function getNote(habitId: string, date: string): string | null { return noteMap.get(`${habitId}::${date}`) ?? null }
  function openNote(habitId: string) {
    setNoteDraft(getNote(habitId, selectedDate) ?? '')
    setNoteTarget({ habitId, date: selectedDate })
  }

  const monthlyRates = useMemo<Record<string, number>>(() => {
    const now      = new Date()
    const todayStr = format(now, 'yyyy-MM-dd')
    // Seules les complétions abouties comptent : une habitude quantifiable à
    // 2/8 ne doit pas gonfler le taux mensuel.
    const localSet = new Set(completions.filter(c => c.completed).map(c => `${c.habit_id}::${c.date}`))
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

  // Classement de la semaine : complétions abouties (lun→dim) attribuées au
  // membre propriétaire de l'habitude. Affiché seulement à ≥ 2 membres.
  const weekLeaderboard = useMemo(() => {
    if (members.length < 2) return []
    const weekSet = new Set(weekDates())
    const ownerOf = new Map(habits.map(h => [h.id, h.member_id]))
    const byMember = new Map<string, number>()
    for (const c of completions) {
      if (!c.completed || !weekSet.has(c.date)) continue
      const owner = ownerOf.get(c.habit_id)
      if (!owner) continue
      byMember.set(owner, (byMember.get(owner) ?? 0) + 1)
    }
    return members
      .map((m, i) => ({ member: m, color: memberColor(i), count: byMember.get(m.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
  }, [members, habits, completions])

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
    const streak = calcStreak(habit, completions)
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
        count={getCount(habit.id, selectedDate)}
        target={habit.target_count ?? 1}
        hasNote={!!getNote(habit.id, selectedDate)}
        readOnly={isFuture}
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
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return
    const target = Math.max(1, habit.target_count ?? 1)
    const current = getCount(habitId, selectedDate)
    const nextCount = current >= target ? 0 : current + 1
    setCount.mutate({ habitId, date: selectedDate, count: nextCount, target })
  }

  function openEdit(habit: Habit) {
    setEditDraft({
      name: habit.name,
      emoji: habit.emoji,
      member_id: habit.member_id,
      kind: habit.kind ?? 'do',
      target_count: habit.target_count ?? 1,
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
        kind: editDraft.kind,
        target_count: Math.max(1, editDraft.target_count || 1),
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
        kind: draft.kind,
        target_count: Math.max(1, draft.target_count || 1),
        frequency: draft.frequency,
        frequency_days: freqDays,
        start_date: draft.start_date || null,
        reminder_time: draft.reminder_time || null,
      })
      setDraft({ name: '', emoji: '⭐', member_id: currentMember?.id ?? null, kind: 'do', target_count: 1, frequency: 'daily', frequency_days: null, start_date: null, reminder_time: null })
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

      {/* ── Classement de la semaine ─────────────────────────────────── */}
      {weekLeaderboard.length > 1 && weekLeaderboard.some(r => r.count > 0) && (
        <div className={styles.leaderboard}>
          <span className={styles.leaderboardTitle}>🏆 Cette semaine</span>
          <div className={styles.leaderboardRows}>
            {weekLeaderboard.map((r, i) => (
              <div key={r.member.id} className={styles.lbRow}>
                <span className={styles.lbRank}>{i === 0 && r.count > 0 ? '👑' : `#${i + 1}`}</span>
                <span className={styles.lbDot} style={{ background: r.color }} />
                <span className={styles.lbName}>{r.member.display_name}</span>
                <span className={styles.lbCount}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          disabled={selectedDate >= MAX_DATE}
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
