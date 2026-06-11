import { memberColor } from '../../lib/constants'
import { WEEK_LABELS, EMOJI_PALETTE, FREQ_OPTS } from './habits.utils'
import styles from './HabitsPage.module.css'

export type HabitDraft = {
  name: string
  emoji: string
  member_id: string | null
  kind: 'do' | 'avoid'
  target_count: number
  frequency: string
  frequency_days: number[] | null
  start_date: string | null
  reminder_time: string | null
}

// Formulaire partagé entre la création et l'édition d'une habitude.
export default function HabitForm({ draft, setDraft, members, isPending, submitLabel }: {
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
        <label className={styles.fieldLabel}>Type</label>
        <div className={styles.freqPills}>
          <button
            type="button"
            className={[styles.freqPill, draft.kind === 'do' ? styles.freqPillActive : ''].join(' ')}
            onClick={() => setDraft(d => ({ ...d, kind: 'do' }))}
          >✅ À faire</button>
          <button
            type="button"
            className={[styles.freqPill, draft.kind === 'avoid' ? styles.freqPillActive : ''].join(' ')}
            onClick={() => setDraft(d => ({ ...d, kind: 'avoid' }))}
          >🚫 À éviter</button>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Objectif par jour</label>
        <div className={styles.reminderRow}>
          <button
            type="button"
            className={[styles.freqPill, draft.target_count <= 1 ? styles.freqPillActive : ''].join(' ')}
            style={{ flexShrink: 0 }}
            onClick={() => setDraft(d => ({ ...d, target_count: 1 }))}
          >Simple (oui/non)</button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            className={styles.timeInput}
            value={draft.target_count > 1 ? draft.target_count : ''}
            onChange={e => setDraft(d => ({ ...d, target_count: Math.max(1, parseInt(e.target.value) || 1) }))}
            placeholder="Ex : 8 (verres)"
          />
        </div>
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
