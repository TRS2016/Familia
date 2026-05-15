import { useState } from 'react'
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

  const weekEnd = addDays(weekStart, 6)
  const monthFirst = startOfMonth(monthCursor)
  const monthLast = endOfMonth(monthCursor)
  const agendaEnd = addDays(agendaStart, 59)

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
    else setAgendaStart(d => addDays(d, -30))
  }
  function goForward() {
    if (view === 'week') setWeekStart(w => addWeeks(w, 1))
    else if (view === 'month') setMonthCursor(m => addMonths(m, 1))
    else setAgendaStart(d => addDays(d, 30))
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setMonthCursor(startOfMonth(new Date()))
    setAgendaStart(startOfDay(new Date()))
  }

  function handleDayClick(day: Date) {
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }))
    setView('week')
  }

  const navLabel = view === 'week'
    ? `${capitalize(format(weekStart, 'd MMM', { locale: fr }))} – ${capitalize(format(weekEnd, 'd MMM yyyy', { locale: fr }))}`
    : view === 'month'
    ? capitalize(format(monthCursor, 'MMMM yyyy', { locale: fr }))
    : `${capitalize(format(agendaStart, 'd MMM', { locale: fr }))} – ${capitalize(format(agendaEnd, 'd MMM yyyy', { locale: fr }))}`

  // ── Data ─────────────────────────────────────────────────────────────────
  const { query, addEvent, updateEvent, deleteEvent } = useEvents(rangeStart, rangeEnd)
  const allEvents = query.data ?? []

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
            onClick={() => setView('agenda')}
          >
            Agenda
          </button>
          <button
            className={[styles.viewBtn, view === 'week' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => setView('week')}
          >
            Sem.
          </button>
          <button
            className={[styles.viewBtn, view === 'month' ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => setView('month')}
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

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {/* ── Agenda view ──────────────────────────────────────────────────── */}
      {view === 'agenda' && !query.isLoading && (
        allEvents.length === 0 ? (
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
              for (const e of allEvents) {
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
          </div>
        )
      )}

      {/* ── Week view ────────────────────────────────────────────────────── */}
      {view === 'week' && !query.isLoading && allEvents.length === 0 && (
        <EmptyState
          emoji="📅"
          title="Semaine libre !"
          description="Aucun événement cette semaine."
          action={{ label: '+ Ajouter un événement', onClick: () => openAddForm() }}
        />
      )}

      {view === 'week' && (
        <div className={styles.weekList}>
          {weekDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd')
            const isToday = dayStr === todayStr
            const dayEvents = allEvents
              .filter(e => e.date === dayStr)
              .sort((a, b) => {
                if (a.all_day && !b.all_day) return -1
                if (!a.all_day && b.all_day) return 1
                return (a.start_time ?? '').localeCompare(b.start_time ?? '')
              })
            return (
              <div key={dayStr} className={styles.dayCard}>
                <div className={styles.dayHeader}>
                  <div className={[styles.dayBadge, isToday ? styles.dayBadgeToday : ''].join(' ')}>
                    <span className={styles.dayLetter}>
                      {capitalize(format(day, 'EEE', { locale: fr })).slice(0, 3)}
                    </span>
                    <span className={[styles.dayNumber, isToday ? styles.dayNumberToday : ''].join(' ')}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  {isToday && <span className={styles.todayBadge}>Aujourd'hui</span>}
                  <button
                    className={styles.eventDeleteBtn}
                    style={{ opacity: 1, marginLeft: 'auto' }}
                    onClick={() => openAddForm(dayStr)}
                    aria-label={`Ajouter un événement le ${dayStr}`}
                  >
                    <Plus size={15} strokeWidth={2.5} color="var(--accent)" />
                  </button>
                </div>

                {dayEvents.length === 0 ? (
                  <p className={styles.dayEmpty}>Aucun événement</p>
                ) : (
                  <ul className={styles.eventList}>
                    {dayEvents.map(event => {
                      const isOptimistic = event.id.startsWith('optimistic-')
                      const color = getMemberColor(event.member_id, householdMembers)
                      return (
                        <li
                          key={event.id}
                          className={[
                            styles.eventItem,
                            isOptimistic ? styles.eventOptimistic : '',
                          ].join(' ')}
                          onClick={() => !isOptimistic && openEditForm(event)}
                        >
                          <span className={styles.eventBar} style={{ background: color }} />
                          <div className={styles.eventContent}>
                            <div className={styles.eventTitle}>{event.title}</div>
                            <div className={styles.eventMeta}>
                              {event.all_day ? (
                                <span className={styles.eventMetaItem}>Toute la journée</span>
                              ) : event.start_time ? (
                                <span className={styles.eventMetaItem}>
                                  <Clock size={10} />
                                  {pgTimeToInput(event.start_time)}
                                  {event.end_time && ` – ${pgTimeToInput(event.end_time)}`}
                                </span>
                              ) : null}
                              {event.location && (
                                <span className={styles.eventMetaItem}>
                                  <MapPin size={10} />
                                  {event.location}
                                </span>
                              )}
                              {event.member && (
                                <span className={styles.eventMetaItem} style={{ color }}>
                                  {event.member.display_name}
                                </span>
                              )}
                              {event.recurrence_group_id && (
                                <span className={styles.eventMetaItem}>
                                  <RotateCw size={10} />
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className={styles.eventDeleteBtn}
                            onClick={e => { e.stopPropagation(); deleteEvent.mutate({ id: event.id }) }}
                            disabled={isOptimistic}
                            aria-label={`Supprimer ${event.title}`}
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
          })}
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
                    const dayEvents = allEvents.filter(e => e.date === dayStr)
                    const inMonth = isSameMonth(day, monthCursor)
                    const isToday = dayStr === todayStr
                    return (
                      <td
                        key={dayStr}
                        className={[
                          styles.monthTd,
                          !inMonth ? styles.monthTdOff : '',
                          isToday ? styles.monthTdToday : '',
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
