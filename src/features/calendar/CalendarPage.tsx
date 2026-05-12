import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addDays, addWeeks, format, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useEvents } from './useEvents'
import { useEventsRealtime } from './useEventsRealtime'
import type { CalendarEvent, NewEventInput } from './useEvents'

// ── Helpers ────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Postgres returns "HH:MM:SS", <input type="time"> needs "HH:MM".
function pgTimeToInput(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { data: member } = useMember()
  useEventsRealtime()

  // ── Week navigation ──────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const weekEnd = addDays(weekStart, 6)
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // ── Data ─────────────────────────────────────────────────────────────────
  const { query, addEvent, updateEvent, deleteEvent } = useEvents(weekStartStr, weekEndStr)

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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <p><Link to="/">← Accueil</Link></p>
      <h1>Calendrier</h1>

      {/* Week navigation */}
      <div>
        <button onClick={() => setWeekStart(w => addWeeks(w, -1))}>{'<'}</button>
        {' '}
        <strong>
          {capitalize(format(weekStart, 'd MMM', { locale: fr }))}
          {' – '}
          {capitalize(format(weekEnd, 'd MMM yyyy', { locale: fr }))}
        </strong>
        {' '}
        <button onClick={() => setWeekStart(w => addWeeks(w, 1))}>{'>'}</button>
        {' '}
        <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Aujourd'hui
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: 12, margin: '12px 0' }}>
          <h3>{editingId ? 'Modifier l\'événement' : 'Nouvel événement'}</h3>

          <div>
            <label htmlFor="ev-title">Titre *</label>{' '}
            <input
              id="ev-title"
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="ev-date">Date *</label>{' '}
            <input
              id="ev-date"
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={formAllDay}
                onChange={e => setFormAllDay(e.target.checked)}
              />
              {' '}Toute la journée
            </label>
          </div>

          {!formAllDay && (
            <div>
              <label htmlFor="ev-start">Heure début</label>{' '}
              <input
                id="ev-start"
                type="time"
                value={formStartTime}
                onChange={e => setFormStartTime(e.target.value)}
              />
              {' '}
              <label htmlFor="ev-end">fin</label>{' '}
              <input
                id="ev-end"
                type="time"
                value={formEndTime}
                onChange={e => setFormEndTime(e.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor="ev-member">Pour</label>{' '}
            <select
              id="ev-member"
              value={formMemberId ?? ''}
              onChange={e => setFormMemberId(e.target.value || null)}
            >
              <option value="">—</option>
              {householdMembers?.map(m => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ev-location">Lieu</label>{' '}
            <input
              id="ev-location"
              type="text"
              value={formLocation}
              onChange={e => setFormLocation(e.target.value)}
              placeholder="optionnel"
            />
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

      {/* Week view */}
      {query.isLoading && <p>Chargement...</p>}

      {days.map(day => {
        const dayStr = format(day, 'yyyy-MM-dd')
        const dayEvents = (query.data ?? [])
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

            {dayEvents.length === 0 ? (
              <p style={{ color: '#aaa', margin: 0 }}>—</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {dayEvents.map(event => {
                  const isOptimistic = event.id.startsWith('optimistic-')
                  return (
                    <li
                      key={event.id}
                      style={{ opacity: isOptimistic ? 0.5 : 1, marginBottom: 4, cursor: 'pointer' }}
                      onClick={() => !isOptimistic && openEditForm(event)}
                    >
                      <span>
                        {event.all_day
                          ? '● '
                          : event.start_time
                            ? `${pgTimeToInput(event.start_time)} `
                            : ''}
                        <strong>{event.title}</strong>
                        {event.member && ` · ${event.member.display_name}`}
                        {event.location && ` · 📍${event.location}`}
                      </span>
                      {' '}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          deleteEvent.mutate(event.id)
                        }}
                        disabled={isOptimistic}
                        aria-label={`Supprimer ${event.title}`}
                      >
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {/* Floating add button */}
      {!showForm && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => openAddForm()}>+ Nouvel événement</button>
        </div>
      )}
    </div>
  )
}
