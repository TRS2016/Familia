import { useState, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays, addWeeks, addMonths,
  format, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfDay,
  eachDayOfInterval, isSameMonth,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X, Clock, MapPin, RotateCw } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useEvents } from './useEvents'
import { useEventsRealtime } from './useEventsRealtime'
import type { CalendarEvent, NewEventInput, RecurrenceType } from './useEvents'
import { MEMBER_PALETTE } from '../../lib/constants'
import { QK } from '../../lib/query-keys'
import { capitalize } from '../../lib/utils'
import styles from './CalendarPage.module.css'

type View = 'week' | 'month' | 'agenda'

const WEEK_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HOUR_HEIGHT = 64 // px per hour in the week grid

const RECURRENCE_OPTIONS: { key: RecurrenceType; label: string }[] = [
  { key: 'none',    label: 'Jamais'  },
  { key: 'weekly',  label: 'Hebdo'   },
  { key: 'monthly', label: 'Mensuel' },
  { key: 'yearly',  label: 'Annuel'  },
]

export function getMemberColor(
  memberId: string | null,
  allMembers: { id: string }[],
): string {
  if (!memberId || allMembers.length === 0) return '#A89F97'
  const index = allMembers.findIndex(m => m.id === memberId)
  return MEMBER_PALETTE[index >= 0 ? index % MEMBER_PALETTE.length : 0]
}

function pgTimeToInput(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

type EventLayout = { col: number; totalCols: number }

function layoutDayEvents(events: CalendarEvent[]): Map<string, EventLayout> {
  const timed = events.filter(e => !e.all_day && e.start_time)
  if (timed.length === 0) return new Map()

  const sorted = [...timed].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const colAssignment = new Map<string, number>()
  const colEndMin: number[] = []

  for (const ev of sorted) {
    const s = timeToMinutes(ev.start_time!)
    const e = ev.end_time ? timeToMinutes(ev.end_time) : s + 60
    let col = colEndMin.findIndex(end => end <= s)
    if (col === -1) { col = colEndMin.length; colEndMin.push(e) }
    else colEndMin[col] = e
    colAssignment.set(ev.id, col)
  }

  const result = new Map<string, EventLayout>()
  for (const ev of sorted) {
    const s = timeToMinutes(ev.start_time!)
    const e = ev.end_time ? timeToMinutes(ev.end_time) : s + 60
    const myCol = colAssignment.get(ev.id)!
    const overlapping = sorted.filter(o => {
      if (o.id === ev.id) return false
      const os = timeToMinutes(o.start_time!)
      const oe = o.end_time ? timeToMinutes(o.end_time) : os + 60
      return os < e && oe > s
    })
    const totalCols = Math.max(myCol + 1, ...overlapping.map(o => (colAssignment.get(o.id) ?? 0) + 1))
    result.set(ev.id, { col: myCol, totalCols })
  }
  return result
}

export default function CalendarPage() {
  const { data: member } = useMember()
  useEventsRealtime()

  // ── View & navigation ────────────────────────────────────────────────────
  const [view, setView] = useState<View>('agenda')
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(new Date())
  )
  const [agendaStart, setAgendaStart] = useState(() => startOfDay(new Date()))
  const [agendaDaysCount, setAgendaDaysCount] = useState(60)
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null)

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)

  function switchView(newView: View) {
    if (newView === 'agenda') setAgendaDaysCount(60)
    if (newView !== 'month') setSelectedMonthDay(null)
    setView(newView)
  }

  // ── Refs ─────────────────────────────────────────────────────────────────
  const weekGridScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── Current time ─────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // ── Auto-scroll week grid to current time ────────────────────────────────
  useEffect(() => {
    if (view !== 'week') return
    const el = weekGridScrollRef.current
    if (!el) return
    const now = new Date()
    const scrollY = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT - 120
    el.scrollTop = Math.max(0, scrollY)
  }, [view])

  // ── Agenda infinite scroll ───────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'agenda') return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setAgendaDaysCount(n => n + 30) },
      { rootMargin: '200px' }
    )
    const el = sentinelRef.current
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [view, agendaDaysCount])

  const weekEnd = addDays(weekStart, 6)
  const monthFirst = startOfMonth(monthCursor)
  const monthLast = endOfMonth(monthCursor)
  const agendaEnd = addDays(agendaStart, agendaDaysCount - 1)

  const rangeStart = view === 'week'
    ? format(weekStart, 'yyyy-MM-dd')
    : view === 'month'
    ? format(monthFirst, 'yyyy-MM-dd')
    : format(agendaStart, 'yyyy-MM-dd')
  const rangeEnd = view === 'week'
    ? format(weekEnd, 'yyyy-MM-dd')
    : view === 'month'
    ? format(monthLast, 'yyyy-MM-dd')
    : format(agendaEnd, 'yyyy-MM-dd')

  const weekDays = view === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : []

  const gridDays = view === 'month'
    ? eachDayOfInterval({
        start: startOfWeek(monthFirst, { weekStartsOn: 1 }),
        end: endOfWeek(monthLast, { weekStartsOn: 1 }),
      })
    : []
  const monthWeeks: Date[][] = []
  for (let i = 0; i < gridDays.length; i += 7) {
    monthWeeks.push(gridDays.slice(i, i + 7))
  }

  function goBack() {
    if (view === 'week') setWeekStart(w => addWeeks(w, -1))
    else if (view === 'month') setMonthCursor(m => addMonths(m, -1))
    else { setAgendaDaysCount(60); setAgendaStart(d => addDays(d, -30)) }
  }
  function goForward() {
    if (view === 'week') setWeekStart(w => addWeeks(w, 1))
    else if (view === 'month') setMonthCursor(m => addMonths(m, 1))
    else { setAgendaDaysCount(60); setAgendaStart(d => addDays(d, 30)) }
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setMonthCursor(startOfMonth(new Date()))
    setAgendaStart(startOfDay(new Date()))
    setAgendaDaysCount(60)
  }

  function handleDayClick(day: Date) {
    const dayStr = format(day, 'yyyy-MM-dd')
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }))
    setSelectedMonthDay(prev => prev === dayStr ? null : dayStr)
  }

  const navLabel = view === 'week'
    ? `${capitalize(format(weekStart, 'd MMM', { locale: fr }))} – ${capitalize(format(weekEnd, 'd MMM yyyy', { locale: fr }))}`
    : view === 'month'
    ? capitalize(format(monthCursor, 'MMMM yyyy', { locale: fr }))
    : `${capitalize(format(agendaStart, 'd MMM', { locale: fr }))} – ${capitalize(format(agendaEnd, 'd MMM yyyy', { locale: fr }))}`

  // ── Data ─────────────────────────────────────────────────────────────────
  const { query, addEvent, updateEvent, deleteEvent } = useEvents(rangeStart, rangeEnd)
  const allEvents = query.data ?? []

  const filteredEvents = filterMemberId
    ? allEvents.filter(e => e.member_id === filterMemberId)
    : allEvents

  const { data: householdMembers = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('id, display_name')
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  // ── Form state ───────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRecurrenceGroupId, setEditingRecurrenceGroupId] = useState<string | null>(null)
  const [editScope, setEditScope] = useState<'one' | 'series'>('one')
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formAllDay, setFormAllDay] = useState(false)
  const [formMemberId, setFormMemberId] = useState<string | null>(null)
  const [formLocation, setFormLocation] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formRecurrence, setFormRecurrence] = useState<RecurrenceType>('none')

  function openAddForm(defaultDate?: string) {
    setEditingId(null)
    setEditingRecurrenceGroupId(null)
    setEditScope('one')
    setFormTitle('')
    setFormDate(defaultDate ?? format(new Date(), 'yyyy-MM-dd'))
    setFormStartTime('')
    setFormEndTime('')
    setFormAllDay(false)
    setFormMemberId(member?.id ?? null)
    setFormLocation('')
    setFormDescription('')
    setFormRecurrence('none')
    setShowForm(true)
  }

  function openEditForm(event: CalendarEvent) {
    setEditingId(event.id)
    setEditingRecurrenceGroupId(event.recurrence_group_id)
    setEditScope('one')
    setFormTitle(event.title)
    setFormDate(event.date)
    setFormStartTime(pgTimeToInput(event.start_time))
    setFormEndTime(pgTimeToInput(event.end_time))
    setFormAllDay(event.all_day)
    setFormMemberId(event.member_id)
    setFormLocation(event.location ?? '')
    setFormDescription(event.description ?? '')
    setFormRecurrence((event.recurrence_type as RecurrenceType | null) ?? 'none')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input: NewEventInput = {
      title: formTitle,
      date: formDate,
      start_time: formAllDay ? null : (formStartTime || null),
      end_time: formAllDay ? null : (formEndTime || null),
      all_day: formAllDay,
      member_id: formMemberId,
      location: formLocation || null,
      description: formDescription || null,
      recurrence: formRecurrence,
    }
    if (editingId) {
      updateEvent.mutate({ id: editingId, ...input, scope: editScope, recurrenceGroupId: editingRecurrenceGroupId })
    } else {
      addEvent.mutate(input)
    }
    closeForm()
  }

  const isPending = addEvent.isPending || updateEvent.isPending
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Calendrier</h1>
        <div className={styles.viewToggle}>
          <button
            className={[styles.viewBtn, view === 'agenda' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => switchView('agenda')}
          >
            Agenda
          </button>
          <button
            className={[styles.viewBtn, view === 'week' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => switchView('week')}
          >
            Sem.
          </button>
          <button
            className={[styles.viewBtn, view === 'month' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => switchView('month')}
          >
            Mois
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className={styles.nav}>
        <button className={styles.navArrow} onClick={goBack} aria-label="Précédent">
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <button className={styles.navLabel} onClick={goToday}>{navLabel}</button>
        <button className={styles.navArrow} onClick={goForward} aria-label="Suivant">
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </nav>

      {/* Member filter */}
      {householdMembers.length > 1 && (
        <div className={styles.memberFilter}>
          <button
            className={[styles.filterChip, !filterMemberId ? styles.filterChipActive : ''].join(' ')}
            onClick={() => setFilterMemberId(null)}
          >
            Tous
          </button>
          {householdMembers.map((m, i) => {
            const color = MEMBER_PALETTE[i % MEMBER_PALETTE.length]
            const active = filterMemberId === m.id
            return (
              <button
                key={m.id}
                className={[styles.filterChip, active ? styles.filterChipActive : ''].join(' ')}
                style={active ? { borderColor: color, background: color + '22', color } : {}}
                onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
              >
                {m.display_name}
              </button>
            )
          })}
        </div>
      )}

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {/* ── Agenda view ──────────────────────────────────────────────────── */}
      {view === 'agenda' && !query.isLoading && (
        filteredEvents.length === 0 ? (
          <EmptyState
            emoji="📅"
            title="Rien de prévu"
            description="Aucun événement sur cette période."
            action={{ label: '+ Ajouter un événement', onClick: () => openAddForm() }}
          />
        ) : (
          <div className={styles.agendaList}>
            {(() => {
              const byDate = new Map<string, CalendarEvent[]>()
              for (const e of filteredEvents) {
                if (!byDate.has(e.date)) byDate.set(e.date, [])
                byDate.get(e.date)!.push(e)
              }
              return [...byDate.entries()].map(([dateStr, events]) => {
                const isToday = dateStr === todayStr
                const [y, mo, d] = dateStr.split('-').map(Number)
                const date = new Date(y, mo - 1, d)
                return (
                  <div key={dateStr} className={styles.agendaGroup}>
                    <div className={[styles.agendaDateCol, isToday ? styles.agendaDateToday : ''].join(' ')}>
                      <span className={styles.agendaDayName}>
                        {capitalize(format(date, 'EEE', { locale: fr }))}
                      </span>
                      <span className={styles.agendaDayNum}>{format(date, 'd')}</span>
                      <span className={styles.agendaMonthName}>
                        {capitalize(format(date, 'MMM', { locale: fr }))}
                      </span>
                    </div>
                    <ul className={styles.agendaEvents}>
                      {events.map(event => {
                        const color = getMemberColor(event.member_id, householdMembers)
                        const isOptimistic = event.id.startsWith('optimistic-')
                        return (
                          <li
                            key={event.id}
                            className={[styles.agendaItem, isOptimistic ? styles.eventOptimistic : ''].join(' ')}
                            onClick={() => !isOptimistic && openEditForm(event)}
                          >
                            <span className={styles.agendaBar} style={{ background: color }} />
                            <div className={styles.agendaContent}>
                              <span className={styles.agendaTitle}>{event.title}</span>
                              <div className={styles.agendaMeta}>
                                {event.all_day ? (
                                  <span>Toute la journée</span>
                                ) : event.start_time ? (
                                  <span>
                                    <Clock size={10} />
                                    {pgTimeToInput(event.start_time)}
                                    {event.end_time && ` – ${pgTimeToInput(event.end_time)}`}
                                  </span>
                                ) : null}
                                {event.location && (
                                  <span><MapPin size={10} /> {event.location}</span>
                                )}
                                {event.member && (
                                  <span style={{ color }}>{event.member.display_name}</span>
                                )}
                                {event.recurrence_group_id && (
                                  <span><RotateCw size={10} /></span>
                                )}
                              </div>
                              {event.description && (
                                <p className={styles.agendaDesc}>{event.description}</p>
                              )}
                            </div>
                            <button
                              className={styles.eventDeleteBtn}
                              onClick={ev => { ev.stopPropagation(); deleteEvent.mutate({ id: event.id }) }}
                              disabled={isOptimistic}
                              aria-label={`Supprimer ${event.title}`}
                            >
                              <X size={14} strokeWidth={2.5} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })
            })()}
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className={styles.agendaSentinel}>
              {query.isFetching && <Spinner size={20} />}
            </div>
          </div>
        )
      )}

      {/* ── Week view (time grid) ─────────────────────────────────────────── */}
      {view === 'week' && !query.isLoading && (
        <div className={styles.weekGrid}>

          {/* Day headers (sticky) */}
          <div className={styles.weekGridHeader}>
            <div className={styles.weekGridGutter} />
            {weekDays.map(day => {
              const dayStr = format(day, 'yyyy-MM-dd')
              const isToday = dayStr === todayStr
              return (
                <div
                  key={dayStr}
                  className={[styles.weekGridDayHead, isToday ? styles.weekGridDayHeadToday : ''].join(' ')}
                >
                  <span className={styles.weekGridDayName}>
                    {capitalize(format(day, 'EEE', { locale: fr })).slice(0, 3)}
                  </span>
                  <div className={[styles.weekGridDayNum, isToday ? styles.weekGridDayNumToday : ''].join(' ')}>
                    {format(day, 'd')}
                    <button
                      className={styles.weekGridAddBtn}
                      onClick={e => { e.stopPropagation(); openAddForm(dayStr) }}
                      aria-label={`Ajouter le ${dayStr}`}
                    >
                      <Plus size={10} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* All-day strip */}
          {weekDays.some(day => filteredEvents.some(e => e.date === format(day, 'yyyy-MM-dd') && e.all_day)) && (
            <div className={styles.weekGridAllDayRow}>
              <div className={styles.weekGridGutter}>
                <span className={styles.weekGridAllDayLabel}>jour</span>
              </div>
              {weekDays.map(day => {
                const dayStr = format(day, 'yyyy-MM-dd')
                const allDayEvts = filteredEvents.filter(e => e.date === dayStr && e.all_day)
                return (
                  <div key={dayStr} className={styles.weekGridAllDayCol}>
                    {allDayEvts.map(ev => {
                      const color = getMemberColor(ev.member_id, householdMembers)
                      const isOptimistic = ev.id.startsWith('optimistic-')
                      return (
                        <div
                          key={ev.id}
                          className={[styles.weekGridAllDayEvent, isOptimistic ? styles.eventOptimistic : ''].join(' ')}
                          style={{ background: color + '28', color, borderLeft: `3px solid ${color}` }}
                          onClick={() => !isOptimistic && openEditForm(ev)}
                        >
                          {ev.title}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Scrollable time body */}
          <div className={styles.weekGridScrollArea} ref={weekGridScrollRef}>
            <div className={styles.weekGridTimeBody}>

              {/* Hour labels (left gutter) */}
              <div className={styles.weekGridGutter}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className={styles.weekGridHourSlot}>
                    {h > 0 && (
                      <span className={styles.weekGridHourLabel}>
                        {String(h).padStart(2, '0')}h
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div className={styles.weekGridDayCols}>
                {weekDays.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd')
                  const isToday = dayStr === todayStr
                  const timedEvts = filteredEvents.filter(e => e.date === dayStr && !e.all_day && e.start_time)
                  const untimedEvts = filteredEvents.filter(e => e.date === dayStr && !e.all_day && !e.start_time)
                  const evLayout = layoutDayEvents(timedEvts)

                  return (
                    <div
                      key={dayStr}
                      className={[styles.weekGridDayCol, isToday ? styles.weekGridDayColToday : ''].join(' ')}
                    >
                      {/* Hour lines (background) */}
                      {Array.from({ length: 24 }, (_, h) => (
                        <div
                          key={h}
                          className={styles.weekGridHourLine}
                          style={{ top: h * HOUR_HEIGHT }}
                        />
                      ))}

                      {/* Current time indicator */}
                      {isToday && (
                        <div
                          className={styles.weekGridNowLine}
                          style={{
                            top: (currentTime.getHours() * 60 + currentTime.getMinutes()) / 60 * HOUR_HEIGHT,
                          }}
                        />
                      )}

                      {/* Events without time */}
                      {untimedEvts.length > 0 && (
                        <div className={styles.weekGridUntimed}>
                          {untimedEvts.map(ev => {
                            const color = getMemberColor(ev.member_id, householdMembers)
                            return (
                              <div
                                key={ev.id}
                                className={styles.weekGridUntimeEvent}
                                style={{ background: color + '28', color, borderLeft: `3px solid ${color}` }}
                                onClick={e => { e.stopPropagation(); openEditForm(ev) }}
                              >
                                {ev.title}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Timed events */}
                      {timedEvts.map(ev => {
                        const l = evLayout.get(ev.id) ?? { col: 0, totalCols: 1 }
                        const color = getMemberColor(ev.member_id, householdMembers)
                        const startMin = timeToMinutes(ev.start_time!)
                        const endMin = ev.end_time ? timeToMinutes(ev.end_time) : startMin + 60
                        const duration = Math.max(endMin - startMin, 30)
                        const isOptimistic = ev.id.startsWith('optimistic-')
                        const isShort = duration <= 30

                        return (
                          <div
                            key={ev.id}
                            className={[
                              styles.weekGridEvent,
                              isOptimistic ? styles.eventOptimistic : '',
                              isShort ? styles.weekGridEventShort : '',
                            ].join(' ')}
                            style={{
                              top: startMin / 60 * HOUR_HEIGHT,
                              height: duration / 60 * HOUR_HEIGHT - 2,
                              left: `${(l.col / l.totalCols) * 100}%`,
                              width: `calc(${(1 / l.totalCols) * 100}% - 4px)`,
                              background: color + '22',
                              borderLeft: `3px solid ${color}`,
                              color,
                            }}
                            onClick={e => { e.stopPropagation(); !isOptimistic && openEditForm(ev) }}
                          >
                            <span className={styles.weekGridEventTitle}>{ev.title}</span>
                            {!isShort && (
                              <span className={styles.weekGridEventTime}>
                                {pgTimeToInput(ev.start_time)}
                                {ev.end_time && ` – ${pgTimeToInput(ev.end_time)}`}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Month view ───────────────────────────────────────────────────── */}
      {view === 'month' && (
        <div className={styles.monthWrapper}>
          <table className={styles.monthTable}>
            <thead>
              <tr>
                {WEEK_DAYS_SHORT.map(d => (
                  <th key={d} className={styles.monthTh}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthWeeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map(day => {
                    const dayStr = format(day, 'yyyy-MM-dd')
                    const dayEvents = filteredEvents.filter(e => e.date === dayStr)
                    const inMonth = isSameMonth(day, monthCursor)
                    const isToday = dayStr === todayStr
                    return (
                      <td
                        key={dayStr}
                        className={[
                          styles.monthTd,
                          !inMonth ? styles.monthTdOff : '',
                          isToday ? styles.monthTdToday : '',
                          dayStr === selectedMonthDay ? styles.monthTdSelected : '',
                        ].join(' ')}
                        onClick={() => handleDayClick(day)}
                      >
                        <div className={[
                          styles.monthDayNum,
                          isToday ? styles.monthDayNumToday : '',
                        ].join(' ')}>
                          {format(day, 'd')}
                        </div>
                        {dayEvents.slice(0, 2).map(e => {
                          const color = getMemberColor(e.member_id, householdMembers)
                          return (
                            <div
                              key={e.id}
                              className={styles.monthEventPill}
                              style={{ background: color + '28', color }}
                            >
                              {e.title}
                            </div>
                          )
                        })}
                        {dayEvents.length > 2 && (
                          <div className={styles.monthMore}>+{dayEvents.length - 2}</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Month day detail panel ───────────────────────────────────────────── */}
      {view === 'month' && selectedMonthDay && (() => {
        const [y, mo, d] = selectedMonthDay.split('-').map(Number)
        const dayDate = new Date(y, mo - 1, d)
        const dayEvents = filteredEvents.filter(e => e.date === selectedMonthDay)
        return (
          <div className={styles.monthDayPanel}>
            <div className={styles.monthDayPanelHeader}>
              <span className={styles.monthDayPanelTitle}>
                {capitalize(format(dayDate, 'EEEE d MMMM', { locale: fr }))}
              </span>
              <button
                className={styles.monthDayPanelAdd}
                onClick={() => openAddForm(selectedMonthDay)}
                aria-label="Ajouter un événement"
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <p className={styles.monthDayPanelEmpty}>Rien ce jour-là</p>
            ) : (
              <ul className={styles.monthDayPanelList}>
                {dayEvents.map(ev => {
                  const color = getMemberColor(ev.member_id, householdMembers)
                  const isOptimistic = ev.id.startsWith('optimistic-')
                  return (
                    <li
                      key={ev.id}
                      className={[styles.monthDayPanelItem, isOptimistic ? styles.eventOptimistic : ''].join(' ')}
                      onClick={() => !isOptimistic && openEditForm(ev)}
                    >
                      <span className={styles.monthDayPanelBar} style={{ background: color }} />
                      <div className={styles.agendaContent}>
                        <span className={styles.agendaTitle}>{ev.title}</span>
                        <div className={styles.agendaMeta}>
                          {ev.all_day ? (
                            <span>Toute la journée</span>
                          ) : ev.start_time ? (
                            <span>
                              <Clock size={10} />
                              {pgTimeToInput(ev.start_time)}
                              {ev.end_time && ` – ${pgTimeToInput(ev.end_time)}`}
                            </span>
                          ) : null}
                          {ev.location && <span><MapPin size={10} /> {ev.location}</span>}
                          {ev.member && <span style={{ color }}>{ev.member.display_name}</span>}
                          {ev.recurrence_group_id && <span><RotateCw size={10} /></span>}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })()}

      {/* FAB */}
      <button
        className={[styles.fab, showForm ? styles.fabHidden : ''].join(' ')}
        onClick={() => openAddForm()}
        aria-label="Nouvel événement"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* Modal slide-up */}
      {showForm && (
        <div className={styles.overlay} onClick={closeForm}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>
                {editingId ? 'Modifier l\'événement' : 'Nouvel événement'}
              </h2>
              <button className={styles.sheetClose} onClick={closeForm} aria-label="Fermer">
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.sheetBody}>

              <div className={styles.formField}>
                <label htmlFor="ev-title" className={styles.formLabel}>Titre *</label>
                <input
                  id="ev-title"
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className={styles.formInput}
                  placeholder="Ex : Dentiste"
                  required
                  autoFocus
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="ev-date" className={styles.formLabel}>Date *</label>
                <input
                  id="ev-date"
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className={styles.formInput}
                  required
                />
              </div>

              <div className={styles.formCheckRow}>
                <input
                  id="ev-allday"
                  type="checkbox"
                  checked={formAllDay}
                  onChange={e => setFormAllDay(e.target.checked)}
                  className={styles.formCheckbox}
                />
                <label htmlFor="ev-allday" className={styles.formCheckLabel}>
                  Toute la journée
                </label>
              </div>

              {!formAllDay && (
                <div className={styles.formRow}>
                  <div className={styles.formField} style={{ flex: 1 }}>
                    <label htmlFor="ev-start" className={styles.formLabel}>Début</label>
                    <input
                      id="ev-start"
                      type="time"
                      value={formStartTime}
                      onChange={e => setFormStartTime(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formField} style={{ flex: 1 }}>
                    <label htmlFor="ev-end" className={styles.formLabel}>Fin</label>
                    <input
                      id="ev-end"
                      type="time"
                      value={formEndTime}
                      onChange={e => setFormEndTime(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              )}

              <div className={styles.formField}>
                <span className={styles.formLabel}>Pour</span>
                <div className={styles.memberRow}>
                  <button
                    type="button"
                    className={styles.memberBtn}
                    style={!formMemberId ? {
                      borderColor: '#A89F97',
                      background: 'rgba(168,159,151,0.12)',
                      color: '#A89F97',
                    } : {}}
                    onClick={() => setFormMemberId(null)}
                  >
                    Tous
                  </button>
                  {householdMembers.map((m, i) => {
                    const color = MEMBER_PALETTE[i % MEMBER_PALETTE.length]
                    const active = formMemberId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={styles.memberBtn}
                        style={active ? {
                          borderColor: color,
                          background: color + '22',
                          color,
                        } : {}}
                        onClick={() => setFormMemberId(m.id)}
                      >
                        {m.display_name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={styles.formField}>
                <label htmlFor="ev-location" className={styles.formLabel}>Lieu</label>
                <input
                  id="ev-location"
                  type="text"
                  value={formLocation}
                  onChange={e => setFormLocation(e.target.value)}
                  className={styles.formInput}
                  placeholder="Adresse ou lieu (optionnel)"
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="ev-desc" className={styles.formLabel}>Notes</label>
                <textarea
                  id="ev-desc"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className={styles.formTextarea}
                  placeholder="Infos pratiques, numéro, lien…"
                  rows={2}
                />
              </div>

              {!editingId && (
                <div className={styles.formField}>
                  <span className={styles.formLabel}>Répétition</span>
                  <div className={styles.recurrenceRow}>
                    {RECURRENCE_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={[styles.recurrenceBtn, formRecurrence === opt.key ? styles.recurrenceBtnActive : ''].join(' ')}
                        onClick={() => setFormRecurrence(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingId && editingRecurrenceGroupId && editScope === 'series' && (
                <div className={styles.formField}>
                  <span className={styles.formLabel}>Répétition</span>
                  <div className={styles.recurrenceRow}>
                    {RECURRENCE_OPTIONS.filter(o => o.key !== 'none').map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        className={[styles.recurrenceBtn, formRecurrence === opt.key ? styles.recurrenceBtnActive : ''].join(' ')}
                        onClick={() => setFormRecurrence(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingId && editingRecurrenceGroupId && (
                <div className={styles.formField}>
                  <span className={styles.formLabel}>Modifier</span>
                  <div className={styles.recurrenceRow}>
                    <button type="button"
                      className={[styles.recurrenceBtn, editScope === 'one' ? styles.recurrenceBtnActive : ''].join(' ')}
                      onClick={() => setEditScope('one')}>
                      Cet événement
                    </button>
                    <button type="button"
                      className={[styles.recurrenceBtn, editScope === 'series' ? styles.recurrenceBtnActive : ''].join(' ')}
                      onClick={() => setEditScope('series')}>
                      Toute la série
                    </button>
                  </div>
                </div>
              )}

              <button type="submit" disabled={isPending} className={styles.submitBtn}>
                {isPending ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Ajouter'}
              </button>

              {editingId && editingRecurrenceGroupId && (
                <button
                  type="button"
                  className={styles.deleteEventBtn}
                  onClick={() => { deleteEvent.mutate({ id: editingId, groupId: editingRecurrenceGroupId }); closeForm() }}
                >
                  Supprimer toute la série
                </button>
              )}

              {editingId && (
                <button
                  type="button"
                  className={styles.deleteEventBtn}
                  onClick={() => { deleteEvent.mutate({ id: editingId }); closeForm() }}
                >
                  {editingRecurrenceGroupId ? 'Supprimer cet événement' : 'Supprimer l\'événement'}
                </button>
              )}

            </form>
          </div>
        </div>
      )}

    </div>
  )
}
