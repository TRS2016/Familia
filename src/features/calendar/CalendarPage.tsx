import { useState, useRef, useEffect } from 'react'
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
import type { CalendarEvent, NewEventInput } from './useEvents'
import { MEMBER_PALETTE } from '../../lib/constants'
import { QK } from '../../lib/query-keys'
import { capitalize } from '../../lib/utils'
import { pgTimeToInput, timeToMinutes, layoutDayEvents } from './calendar.utils'
import { EventFormModal } from './EventFormModal'
import styles from './CalendarPage.module.css'

type View = 'week' | '3day' | 'month' | 'agenda'

const WEEK_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const HOUR_HEIGHT = 48 // px per hour in the week grid

export function getMemberColor(
  memberId: string | null,
  allMembers: { id: string }[],
): string {
  if (!memberId || allMembers.length === 0) return '#A89F97'
  const index = allMembers.findIndex(m => m.id === memberId)
  return MEMBER_PALETTE[index >= 0 ? index % MEMBER_PALETTE.length : 0]
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
    if (newView === 'agenda') {
      setAgendaStart(startOfDay(new Date()))
      setAgendaDaysCount(60)
    }
    if (newView === '3day') {
      setWeekStart(startOfDay(new Date()))
    }
    if (newView !== 'month') setSelectedMonthDay(null)
    setView(newView)
  }

  // ── Refs ─────────────────────────────────────────────────────────────────
  const weekGridScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // ── Current time ─────────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  // ── Auto-scroll week grid to current time ────────────────────────────────
  useEffect(() => {
    if (view !== 'week' && view !== '3day') return
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
  }, [view])

  const weekEnd = addDays(weekStart, 6)
  const monthFirst = startOfMonth(monthCursor)
  const monthLast = endOfMonth(monthCursor)
  const agendaEnd = addDays(agendaStart, agendaDaysCount - 1)

  const threeDayEnd = addDays(weekStart, 2)

  const rangeStart = (view === 'week' || view === '3day')
    ? format(weekStart, 'yyyy-MM-dd')
    : view === 'month'
    ? format(monthFirst, 'yyyy-MM-dd')
    : format(agendaStart, 'yyyy-MM-dd')
  const rangeEnd = view === 'week'
    ? format(weekEnd, 'yyyy-MM-dd')
    : view === '3day'
    ? format(threeDayEnd, 'yyyy-MM-dd')
    : view === 'month'
    ? format(monthLast, 'yyyy-MM-dd')
    : format(agendaEnd, 'yyyy-MM-dd')

  const viewDays = (view === 'week' || view === '3day')
    ? Array.from({ length: view === 'week' ? 7 : 3 }, (_, i) => addDays(weekStart, i))
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
    else if (view === '3day') setWeekStart(w => addDays(w, -3))
    else if (view === 'month') setMonthCursor(m => addMonths(m, -1))
    else { setAgendaDaysCount(60); setAgendaStart(d => addDays(d, -30)) }
  }
  function goForward() {
    if (view === 'week') setWeekStart(w => addWeeks(w, 1))
    else if (view === '3day') setWeekStart(w => addDays(w, 3))
    else if (view === 'month') setMonthCursor(m => addMonths(m, 1))
    else { setAgendaDaysCount(60); setAgendaStart(d => addDays(d, 30)) }
  }
  function goToday() {
    if (view === '3day') setWeekStart(startOfDay(new Date()))
    else setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setMonthCursor(startOfMonth(new Date()))
    setAgendaStart(startOfDay(new Date()))
    setAgendaDaysCount(60)
  }

  function handleDayClick(day: Date) {
    const dayStr = format(day, 'yyyy-MM-dd')
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }))
    setSelectedMonthDay(prev => prev === dayStr ? null : dayStr)
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const navLabel = view === 'week'
    ? `${capitalize(format(weekStart, 'd MMM', { locale: fr }))} – ${capitalize(format(weekEnd, 'd MMM yyyy', { locale: fr }))}`
    : view === '3day'
    ? `${capitalize(format(weekStart, 'd MMM', { locale: fr }))} – ${capitalize(format(threeDayEnd, 'd MMM yyyy', { locale: fr }))}`
    : view === 'month'
    ? capitalize(format(monthCursor, 'MMMM yyyy', { locale: fr }))
    : `${capitalize(format(agendaStart, 'd MMM', { locale: fr }))} – ${capitalize(format(agendaEnd, 'd MMM yyyy', { locale: fr }))}`

  const showsTodayIndicator =
    (view === 'week' && format(weekStart, 'yyyy-MM-dd') <= todayStr && todayStr <= format(weekEnd, 'yyyy-MM-dd')) ||
    (view === '3day' && format(weekStart, 'yyyy-MM-dd') <= todayStr && todayStr <= format(threeDayEnd, 'yyyy-MM-dd')) ||
    (view === 'month' && format(monthCursor, 'yyyy-MM') === format(new Date(), 'yyyy-MM')) ||
    (view === 'agenda' && format(agendaStart, 'yyyy-MM-dd') <= todayStr && todayStr <= format(agendaEnd, 'yyyy-MM-dd'))

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
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [addDefaults, setAddDefaults] = useState<{ date?: string; startTime?: string; endTime?: string }>({})

  function openAddForm(defaultDate?: string, defaultStartTime?: string, defaultEndTime?: string) {
    setEditingEvent(null)
    setAddDefaults({ date: defaultDate, startTime: defaultStartTime, endTime: defaultEndTime })
    setShowForm(true)
  }

  function openEditForm(event: CalendarEvent) {
    setEditingEvent(event)
    setAddDefaults({})
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingEvent(null)
  }

  function handleFormSubmit(input: NewEventInput, editScope: 'one' | 'series') {
    if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, ...input, scope: editScope, recurrenceGroupId: editingEvent.recurrence_group_id })
    } else {
      addEvent.mutate(input)
    }
    closeForm()
  }

  const isPending = addEvent.isPending || updateEvent.isPending

  // ── Swipe navigation ────────────────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY
    touchStartRef.current = null
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx > 0) goForward()
    else goBack()
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

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
            className={[styles.viewBtn, view === '3day' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => switchView('3day')}
          >
            3j
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
        <button className={styles.navLabel} onClick={goToday}>
          {navLabel}
          {showsTodayIndicator && <span className={styles.navTodayDot} />}
        </button>
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

      {/* ── Week / 3-day view (time grid) ───────────────────────────────────── */}
      {(view === 'week' || view === '3day') && !query.isLoading && (
        <div className={styles.weekGrid}>

          {/* Day headers (sticky) */}
          <div className={styles.weekGridHeader}>
            <div className={styles.weekGridGutter} />
            {viewDays.map(day => {
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
          {viewDays.some(day => filteredEvents.some(e => e.date === format(day, 'yyyy-MM-dd') && e.all_day)) && (
            <div className={styles.weekGridAllDayRow}>
              <div className={styles.weekGridGutter}>
                <span className={styles.weekGridAllDayLabel}>jour</span>
              </div>
              {viewDays.map(day => {
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
                          style={{ background: color + '33', borderLeft: `3px solid ${color}` }}
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
              <div
                className={styles.weekGridDayCols}
                style={view === '3day' ? { gridTemplateColumns: 'repeat(3, 1fr)' } : undefined}
              >
                {viewDays.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd')
                  const isToday = dayStr === todayStr
                  const timedEvts = filteredEvents.filter(e => e.date === dayStr && !e.all_day && e.start_time)
                  const untimedEvts = filteredEvents.filter(e => e.date === dayStr && !e.all_day && !e.start_time)
                  const evLayout = layoutDayEvents(timedEvts)

                  return (
                    <div
                      key={dayStr}
                      className={[styles.weekGridDayCol, isToday ? styles.weekGridDayColToday : ''].join(' ')}
                      onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const rawMins = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60
                        const rounded = Math.round(rawMins / 30) * 30
                        const h = Math.min(Math.floor(rounded / 60), 23)
                        const m = rounded % 60
                        const st = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                        const et = `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                        openAddForm(dayStr, st, et)
                      }}
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
                                style={{ background: color + '33', borderLeft: `3px solid ${color}` }}
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
                              background: color + '33',
                              borderLeft: `3px solid ${color}`,
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
              <div className={styles.monthDayPanelActions}>
                <button
                  className={styles.monthDayPanelWeekLink}
                  onClick={() => switchView('week')}
                  title="Voir la semaine"
                >
                  Sem. →
                </button>
                <button
                  className={styles.monthDayPanelAdd}
                  onClick={() => openAddForm(selectedMonthDay)}
                  aria-label="Ajouter un événement"
                >
                  <Plus size={16} strokeWidth={2.5} />
                </button>
              </div>
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
                      <button
                        className={styles.monthDayPanelDelete}
                        onClick={e => { e.stopPropagation(); deleteEvent.mutate({ id: ev.id }) }}
                        disabled={isOptimistic}
                        aria-label={`Supprimer ${ev.title}`}
                      >
                        <X size={14} strokeWidth={2.5} />
                      </button>
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
        onClick={() => openAddForm(view === 'month' && selectedMonthDay ? selectedMonthDay : undefined)}
        aria-label="Nouvel événement"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <EventFormModal
        isOpen={showForm}
        editingEvent={editingEvent}
        addDefaults={addDefaults}
        currentMemberId={member?.id ?? null}
        householdMembers={householdMembers}
        isPending={isPending}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        onDelete={(id, groupId) => { deleteEvent.mutate({ id, groupId }); closeForm() }}
      />

    </div>
  )
}
