import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import { CHORE_CATEGORIES, categoryOf } from './categories'
import { EMOJI_PALETTE, WEEK_LABELS } from './chores.utils'
import type { Chore, NewChoreInput, HouseholdMember } from './useChores'
import styles from './ChoresPage.module.css'

interface Props {
  members: HouseholdMember[]
  initial?: Chore
  onSubmit: (input: NewChoreInput) => void
  onClose: () => void
}

export default function ChoreForm({ members, initial, onSubmit, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'autre')
  const [emoji, setEmoji] = useState(initial?.emoji ?? categoryOf(category).emoji)
  const [points, setPoints] = useState(initial?.points ?? 10)
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'daily')
  const [days, setDays] = useState<number[]>(initial?.frequency_days ?? [])
  const [rotation, setRotation] = useState<string[]>(initial?.rotation_member_ids ?? [])
  const [rotationPeriod, setRotationPeriod] = useState(initial?.rotation_period ?? 'week')
  const [defaultMember, setDefaultMember] = useState<string | null>(initial?.default_member_id ?? null)

  function pickCategory(value: string) {
    setCategory(value)
    if (!initial) setEmoji(categoryOf(value).emoji)
  }

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }
  function toggleRotation(id: string) {
    setRotation(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name, emoji, color: categoryOf(category).color, category, points,
      frequency,
      frequency_days: frequency === 'weekly' ? days : null,
      start_date: initial?.start_date ?? null,
      rotation_member_ids: rotation.length > 0 ? rotation : null,
      rotation_period: rotationPeriod,
      default_member_id: rotation.length > 0 ? null : defaultMember,
    })
    onClose()
  }

  return (
    <SlideUpModal title={initial ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Nom</span>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex. Cuisiner le repas" autoFocus />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Catégorie</span>
          <div className={styles.chipRow}>
            {CHORE_CATEGORIES.map(c => (
              <button type="button" key={c.value}
                className={[styles.chip, category === c.value ? styles.chipActive : ''].join(' ')}
                onClick={() => pickCategory(c.value)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Emoji</span>
          <div className={styles.chipRow}>
            {EMOJI_PALETTE.map(em => (
              <button type="button" key={em}
                className={[styles.emojiChip, emoji === em ? styles.chipActive : ''].join(' ')}
                onClick={() => setEmoji(em)}>{em}</button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Points</span>
          <input className={styles.input} type="number" min={0} max={100} value={points}
            onChange={e => setPoints(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Récurrence</span>
          <div className={styles.chipRow}>
            {[['daily', 'Tous les jours'], ['weekly', 'Jours choisis'], ['none', 'À la demande']].map(([v, l]) => (
              <button type="button" key={v}
                className={[styles.chip, frequency === v ? styles.chipActive : ''].join(' ')}
                onClick={() => setFrequency(v)}>{l}</button>
            ))}
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className={styles.field}>
            <span className={styles.label}>Jours</span>
            <div className={styles.chipRow}>
              {WEEK_LABELS.map((lbl, i) => {
                const d = i + 1
                return (
                  <button type="button" key={i}
                    className={[styles.dayChip, days.includes(d) ? styles.chipActive : ''].join(' ')}
                    onClick={() => toggleDay(d)}>{lbl}</button>
                )
              })}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Rotation (qui s'en occupe)</span>
          <p className={styles.hint}>Sélectionne 2+ membres pour alterner automatiquement, ou laisse vide pour assigner une personne fixe.</p>
          <div className={styles.chipRow}>
            {members.map(m => (
              <button type="button" key={m.id}
                className={[styles.chip, rotation.includes(m.id) ? styles.chipActive : ''].join(' ')}
                onClick={() => toggleRotation(m.id)}>{m.display_name}</button>
            ))}
          </div>
          {rotation.length >= 2 && (
            <div className={styles.chipRow} style={{ marginTop: 8 }}>
              {[['week', 'Chaque semaine'], ['day', 'Chaque jour']].map(([v, l]) => (
                <button type="button" key={v}
                  className={[styles.chip, rotationPeriod === v ? styles.chipActive : ''].join(' ')}
                  onClick={() => setRotationPeriod(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {rotation.length < 2 && (
          <div className={styles.field}>
            <span className={styles.label}>Assigné à (fixe)</span>
            <div className={styles.chipRow}>
              <button type="button"
                className={[styles.chip, defaultMember === null ? styles.chipActive : ''].join(' ')}
                onClick={() => setDefaultMember(null)}>Libre</button>
              {members.map(m => (
                <button type="button" key={m.id}
                  className={[styles.chip, defaultMember === m.id ? styles.chipActive : ''].join(' ')}
                  onClick={() => setDefaultMember(m.id)}>{m.display_name}</button>
              ))}
            </div>
          </div>
        )}

        <button type="submit" className={styles.submitBtn}>
          {initial ? 'Enregistrer' : 'Créer la tâche'}
        </button>
      </form>
    </SlideUpModal>
  )
}
