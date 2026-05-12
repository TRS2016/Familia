import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays, addWeeks, addMonths,
  format, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useEvents } from './useEvents'
import { useEventsRealtime } from './useEventsRealtime'
import type { CalendarEvent, NewEventInput } from './useEvents'

type View = 'week' | 'month'

const WEEK_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function pgTimeToInput(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

export default function CalendarPage() {
  const { data: member } = useMember()
  useEventsRealtime()

  // ── View & navigation ────────────────────────────────────────────────────
  const [view, setView] = useState<View>('week')
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfMonth(new Date())
  )

  const weekEnd = addDays(weekStart, 6)
  const monthFirst = startOfMonth(monthCursor)
  const monthLast = endOfMonth(monthCursor)

  const rangeStart = view === 'week'
    ? format(weekStart, 'yyyy-MM-dd')
    : format(monthFirst, 'yyyy-MM-dd')
  const rangeEnd = view === 'week'
    ? format(weekEnd, 'yyyy-MM-dd')
    : format(monthLast, 'yyyy-MM-dd')

  // Week: 7 days; Month: full grid padded to Mon–Sun boundaries
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
    else setMonthCursor(m => addMonths(m, -1))
  }
  function goForward() {
    if (view === 'week') setWeekStart(w => addWeeks(w, 1))
    else setMonthCursor(m => addMonths(m, 1))
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
    setMonthCursor(startOfMonth(new Date()))
  }

  // Click a day in month view → switch to week view centred on that day
  function handleDayClick(day: Date) {
    setWeekStart(startOfWeek(day, { weekStartsOn: 1 }))
    setView('week')
  }

  const navLabel = view === 'week'
    ? `${capitalize(format(weekStart, 'd MMM', { locale: fr }))} – ${capitalize(format(weekEnd, 'd MMM yyyy', { locale: fr }))}`
    : capitalize(format(monthCursor, 'MMMM yyyy', { locale: fr }))

  // ── Data ─────────────────────────────────────────────────────────────────
  const { query, addEvent, updateEvent, deleteEvent } = useEvents(rangeStart, rangeEnd)
  const allEvents = query.data ?? []

  const { data: householdMembers } = useQuery({
    queryKey: ['members-list', HOUSEHOLD_ID],
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
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formAllDay, setFormAllDay] = useState(false)
  const [formMemberId, setFormMemberId] = useState<string | null>(null)
  const [formLocation, setFormLocation] = useState('')

  function openAddForm(defaultDate?: string) {
    setEditingId(null)
    setFormTitle('')
    setFormDate(defaultDate ?? format(new Date(), 'yyyy-MM-dd'))
    setFormStartTime('')
    setFormEndTime('')
    setFormAllDay(false)
    setFormMemberId(member?.id ?? null)
    setFormLocation('')
    setShowForm(true)
  }

  function openEditForm(event: CalendarEvent) {
    setEditingId(event.id)
    setFormTitle(event.title)
    setFormDate(event.date)
    setFormStartTime(pgTimeToInput(event.start_time))
    setFormEndTime(pgTimeToInput(event.end_time))
    setFormAllDay(event.all_day)
    setFormMemberId(event.member_id)
    setFormLocation(event.location ?? '')
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
    }
    if (editingId) {
      updateEvent.mutate({ id: editingId, ...input })
    } else {
      addEvent.mutate(input)
    }
    closeForm()
  }

  const isPending = addEvent.isPending || updateEvent.isPending
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <p><Link to="/">← Accueil</Link></p>
      <h1>Calendrier</h1>

      {/* View toggle + navigation */}
      <div>
        <button
          onClick={() => setView('week')}
          style={{ fontWeight: view === 'week' ? 'bold' : 'normal' }}
        >
          Semaine
        </button>
        {' '}
        <button
          onClick={() => setView('month')}
          style={{ fontWeight: view === 'month' ? 'bold' : 'normal' }}
        >
          Mois
        </button>
        {'  '}
        <button onClick={goBack}>{'<'}</button>
        {' '}
        <strong>{navLabel}</strong>
        {' '}
        <button onClick={goForward}>{'>'}</button>
        {' '}
        <button onClick={goToday}>Aujourd'hui</button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 12, margin: '12px 0' }}>
          <h3>{editingId ? 'Modifier l\'événement' : 'Nouvel événement'}</h3>
          <div>
            <label htmlFor="ev-title">Titre *</label>{' '}
            <input id="ev-title" type="text" value={formTitle}
              onChange={e => setFormTitle(e.target.value)} required autoFocus />
          </div>
          <div>
            <label htmlFor="ev-date">Date *</label>{' '}
            <input id="ev-date" type="date" value={formDate}
              onChange={e => setFormDate(e.target.value)} required />
          </div>
          <div>
            <label>
              <input type="checkbox" checked={formAllDay}
                onChange={e => setFormAllDay(e.target.checked)} />
              {' '}Toute la journée
            </label>
          </div>
          {!formAllDay && (
            <div>
              <label htmlFor="ev-start">Heure début</label>{' '}
              <input id="ev-start" type="time" value={formStartTime}
                onChange={e => setFormStartTime(e.target.value)} />
              {' '}
              <label htmlFor="ev-end">fin</label>{' '}
              <input id="ev-end" type="time" value={formEndTime}
                onChange={e => setFormEndTime(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="ev-member">Pour</label>{' '}
            <select id="ev-member" value={formMemberId ?? ''}
              onChange={e => setFormMemberId(e.target.value || null)}>
              <option value="">—</option>
              {householdMembers?.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ev-location">Lieu</label>{' '}
            <input id="ev-location" type="text" value={formLocation}
              onChange={e => setFormLocation(e.target.value)} placeholder="optionnel" />
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            {' '}
            <button type="button" onClick={closeForm}>Annuler</button>
          </div>
        </form>
      )}

      {query.isLoading && <p>Chargement...</p>}

      {/* ── Week view ─────────────────────────────────────────────────────── */}
      {view === 'week' && weekDays.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd')
        const dayEvents = allEvents
          .filter(e => e.date === dayStr)
          .sort((a, b) => {
            if (a.all_day && !b.all_day) return -1
            if (!a.all_day && b.all_day) return 1
            return (a.start_time ?? '').localeCompare(b.start_time ?? '')
          })
        return (
          <div key={dayStr} style={{ marginTop: 16 }}>
            <h3 style={{ marginBottom: 4 }}>
              {capitalize(format(day, 'EEEE d MMMM', { locale: fr }))}
            </h3>
            {dayEvents.length === 0
              ? <p style={{ color: '#aaa', margin: 0 }}>—</p>
              : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {dayEvents.map(event => {
                    const isOptimistic = event.id.startsWith('optimistic-')
                    return (
                      <li key={event.id}
                        style={{ opacity: isOptimistic ? 0.5 : 1, marginBottom: 4, cursor: 'pointer' }}
                        onClick={() => !isOptimistic && openEditForm(event)}
                      >
                        {event.all_day ? '● ' : (event.start_time ? `${pgTimeToInput(event.start_time)} ` : '')}
                        <strong>{event.title}</strong>
                        {event.member && ` · ${event.member.display_name}`}
                        {event.location && ` · 📍${event.location}`}
                        {' '}
                        <button
                          onClick={e => { e.stopPropagation(); deleteEvent.mutate(event.id) }}
                          disabled={isOptimistic}
                          aria-label={`Supprimer ${event.title}`}
                        >×</button>
                      </li>
                    )
                  })}
                </ul>
              )}
          </div>
        )
      })}

      {/* ── Month view ────────────────────────────────────────────────────── */}
      {view === 'month' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr>
              {WEEK_DAYS_SHORT.map(d => (
                <th key={d} style={{ textAlign: 'center', padding: 4, borderBottom: '1px solid #ccc' }}>
                  {d}
                </th>
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
                    <td key={dayStr}
                      onClick={() => handleDayClick(day)}
                      style={{
                        verticalAlign: 'top',
                        padding: 4,
                        border: '1px solid #eee',
                        cursor: 'pointer',
                        opacity: inMonth ? 1 : 0.35,
                        minWidth: 60,
                        background: isToday ? '#fff8f0' : 'transparent',
                      }}
                    >
                      <div style={{ fontWeight: isToday ? 'bold' : 'normal', marginBottom: 2 }}>
                        {format(day, 'd')}
                      </div>
                      {dayEvents.slice(0, 2).map(e => (
                        <div key={e.id} style={{
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {e.all_day ? '●' : (e.start_time ? pgTimeToInput(e.start_time) : '·')}{' '}{e.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                          +{dayEvents.length - 2}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* FAB */}
      {!showForm && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => openAddForm()}>+ Nouvel événement</button>
        </div>
      )}
    </div>
  )
}
