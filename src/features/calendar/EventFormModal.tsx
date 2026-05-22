import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { format } from 'date-fns'
import type { CalendarEvent, NewEventInput, RecurrenceType } from './useEvents'
import { pgTimeToInput } from './calendar.utils'
import { MEMBER_PALETTE } from '../../lib/constants'
import styles from './CalendarPage.module.css'

const RECURRENCE_OPTIONS: { key: RecurrenceType; label: string }[] = [
  { key: 'none',    label: 'Jamais'  },
  { key: 'weekly',  label: 'Hebdo'   },
  { key: 'monthly', label: 'Mensuel' },
  { key: 'yearly',  label: 'Annuel'  },
]

interface EventFormModalProps {
  isOpen: boolean
  editingEvent: CalendarEvent | null
  addDefaults: { date?: string; startTime?: string; endTime?: string }
  currentMemberId: string | null
  householdMembers: { id: string; display_name: string }[]
  isPending: boolean
  onClose: () => void
  onSubmit: (input: NewEventInput, editScope: 'one' | 'series') => void
  onDelete: (id: string, groupId?: string | null) => void
}

export function EventFormModal({
  isOpen,
  editingEvent,
  addDefaults,
  currentMemberId,
  householdMembers,
  isPending,
  onClose,
  onSubmit,
  onDelete,
}: EventFormModalProps) {
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

  useEffect(() => {
    if (!isOpen) return
    if (editingEvent) {
      setEditScope('one')
      setFormTitle(editingEvent.title)
      setFormDate(editingEvent.date)
      setFormStartTime(pgTimeToInput(editingEvent.start_time))
      setFormEndTime(pgTimeToInput(editingEvent.end_time))
      setFormAllDay(editingEvent.all_day)
      setFormMemberId(editingEvent.member_id)
      setFormLocation(editingEvent.location ?? '')
      setFormDescription(editingEvent.description ?? '')
      setFormRecurrence((editingEvent.recurrence_type as RecurrenceType | null) ?? 'none')
    } else {
      setEditScope('one')
      setFormTitle('')
      setFormDate(addDefaults.date ?? format(new Date(), 'yyyy-MM-dd'))
      setFormStartTime(addDefaults.startTime ?? '')
      setFormEndTime(addDefaults.endTime ?? '')
      setFormAllDay(false)
      setFormMemberId(currentMemberId)
      setFormLocation('')
      setFormDescription('')
      setFormRecurrence('none')
    }
  }, [isOpen, editingEvent, addDefaults, currentMemberId])

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
    onSubmit(input, editScope)
  }

  if (!isOpen) return null

  const editingId = editingEvent?.id ?? null
  const editingRecurrenceGroupId = editingEvent?.recurrence_group_id ?? null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <h2 className={styles.sheetTitle}>
            {editingId ? 'Modifier l\'événement' : 'Nouvel événement'}
          </h2>
          <button className={styles.sheetClose} onClick={onClose} aria-label="Fermer">
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
              onClick={() => onDelete(editingId, editingRecurrenceGroupId)}
            >
              Supprimer toute la série
            </button>
          )}

          {editingId && (
            <button
              type="button"
              className={styles.deleteEventBtn}
              onClick={() => onDelete(editingId)}
            >
              {editingRecurrenceGroupId ? 'Supprimer cet événement' : 'Supprimer l\'événement'}
            </button>
          )}

        </form>
      </div>
    </div>
  )
}
