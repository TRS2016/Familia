import { useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { X } from 'lucide-react'
import { catGlyph, catColor, isSavingType, monthInputToEndDate } from './kakebo.utils'
import type { EntryDraft } from './kakebo.utils'
import type { KakeboCategory, KakeboMember } from './useKakebo'
import type { SavingGoal } from './useSavingGoals'
import { memberColor } from '../../lib/constants'
import styles from './KakeboPage.module.css'

/**
 * Formulaire d'opération, partagé entre « Nouvelle opération » et
 * « Modifier l'opération ». Les deux modales étaient dupliquées champ par
 * champ et avaient commencé à diverger.
 */
export default function EntryForm({
  draft, setDraft, categories, members, savingGoals,
  scope, setScope, dateMin, dateMax, isPending, submitLabel, onSubmit, idPrefix,
}: {
  draft: EntryDraft
  setDraft: Dispatch<SetStateAction<EntryDraft>>
  categories: KakeboCategory[]
  members: KakeboMember[]
  savingGoals: SavingGoal[]
  /** Portée d'édition d'une série. Absent = formulaire d'ajout. */
  scope?: 'one' | 'series'
  setScope?: (s: 'one' | 'series') => void
  dateMin?: string
  dateMax?: string
  isPending: boolean
  submitLabel: string
  onSubmit: (e: FormEvent) => void
  idPrefix: string
}) {
  const selectedCat = categories.find(c => c.id === draft.category_id)
  const showGoals = isSavingType(selectedCat?.type) && savingGoals.length > 0
  // En portée « toute la série », la date reste propre à chaque occurrence :
  // l'exposer ferait croire qu'on peut décaler le jour d'échéance de la série.
  const showDate = scope !== 'series'

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      {members.length > 0 && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Affecté à</label>
          <div className={styles.catPills}>
            <button
              type="button"
              className={[styles.catPill, draft.member_id === null ? styles.catPillActive : ''].join(' ')}
              style={draft.member_id === null ? { background: 'rgba(224,123,84,0.13)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
              onClick={() => setDraft(d => ({ ...d, member_id: null }))}
            >
              🏠 Foyer
            </button>
            {members.map((m, i) => {
              const active = draft.member_id === m.id
              const color = memberColor(i)
              return (
                <button
                  key={m.id}
                  type="button"
                  className={[styles.catPill, active ? styles.catPillActive : ''].join(' ')}
                  style={active ? { background: `${color}22`, borderColor: color, color } : {}}
                  onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                >
                  {m.display_name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Catégorie</label>
        <div className={styles.catPills}>
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={[styles.catPill, draft.category_id === cat.id ? styles.catPillActive : ''].join(' ')}
              style={draft.category_id === cat.id
                ? { background: `${catColor(cat)}22`, borderColor: catColor(cat), color: catColor(cat) }
                : {}}
              onClick={() => setDraft(d => ({ ...d, category_id: cat.id }))}
            >
              <span className={styles.catPillGlyph}>{catGlyph(cat.type)}</span>
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {showGoals && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Projet d'épargne</label>
          <div className={styles.catPills}>
            <button
              type="button"
              className={[styles.catPill, draft.saving_goal_id === null ? styles.catPillActive : ''].join(' ')}
              onClick={() => setDraft(d => ({ ...d, saving_goal_id: null }))}
            >
              — Aucun
            </button>
            {savingGoals.map(g => (
              <button
                key={g.id}
                type="button"
                className={[styles.catPill, draft.saving_goal_id === g.id ? styles.catPillActive : ''].join(' ')}
                style={draft.saving_goal_id === g.id ? { background: '#3D80B822', borderColor: '#3D80B8', color: '#3D80B8' } : {}}
                onClick={() => setDraft(d => ({ ...d, saving_goal_id: g.id }))}
              >
                {g.emoji} {g.name}{g.archived_at ? ' (archivé)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label htmlFor={`${idPrefix}-amount`} className={styles.fieldLabel}>Montant (€)</label>
        <input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={draft.amount}
          onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
          className={styles.input}
          placeholder="0,00"
          required
          autoFocus
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor={`${idPrefix}-desc`} className={styles.fieldLabel}>Description</label>
        <input
          id={`${idPrefix}-desc`}
          type="text"
          value={draft.description}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          className={styles.input}
          placeholder="Ex. Restaurant, Loyer, Netflix…"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Tags</label>
        <TagInput tags={draft.tags} onChange={tags => setDraft(d => ({ ...d, tags }))} />
      </div>

      {showDate && (
        <div className={styles.fieldGroup}>
          <label htmlFor={`${idPrefix}-date`} className={styles.fieldLabel}>Date</label>
          <input
            id={`${idPrefix}-date`}
            type="date"
            value={draft.date}
            min={dateMin}
            max={dateMax}
            onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
            className={styles.input}
            required
          />
        </div>
      )}

      {draft.series_id && setScope && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Appliquer à</label>
          <div className={styles.catPills}>
            {([['one', 'Cette opération'], ['series', 'Toute la série']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className={[styles.catPill, scope === v ? styles.catPillActive : ''].join(' ')}
                style={scope === v ? { background: 'rgba(224,123,84,0.13)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                onClick={() => setScope(v)}
              >
                {label}
              </button>
            ))}
          </div>
          {scope === 'series' && (
            <p className={styles.fieldHint}>La date reste propre à chaque mois et n'est pas modifiée ici.</p>
          )}
        </div>
      )}

      <label className={styles.recurRow}>
        <input
          type="checkbox"
          checked={draft.recurring}
          onChange={e => setDraft(d => ({ ...d, recurring: e.target.checked, series_end: e.target.checked ? d.series_end : null }))}
        />
        <span>
          🔁 Charge fixe — revient chaque mois
          {draft.recurring
            ? ' à la même date'
            : scope === 'series' ? ' (décocher arrête toute la série)'
            : draft.series_id ? ' (décocher arrête la série)' : ''}
        </span>
      </label>

      {draft.recurring && (
        <div className={styles.fieldGroup}>
          <label htmlFor={`${idPrefix}-end`} className={styles.fieldLabel}>Fin d'échéance (optionnel)</label>
          <input
            id={`${idPrefix}-end`}
            type="month"
            value={draft.series_end ? draft.series_end.slice(0, 7) : ''}
            min={draft.date.slice(0, 7)}
            onChange={e => setDraft(d => ({ ...d, series_end: monthInputToEndDate(e.target.value) }))}
            className={styles.input}
          />
          <p className={styles.fieldHint}>
            Dernier mois où la charge est générée. Vide = sans fin.
            {draft.series_id && scope !== 'series' ? ' Passe en « toute la série » pour l\'appliquer à la charge entière.' : ''}
          </p>
        </div>
      )}

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={isPending || !draft.amount || parseFloat(draft.amount) <= 0}
      >
        {isPending ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}

// ── TagInput ────────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#+/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className={styles.tagEditChips}>
          {tags.map(t => (
            <span key={t} className={styles.tagEditChip}>
              #{t}
              <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Retirer ${t}`}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={styles.input}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
          else if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) add(input) }}
        placeholder="courses, vacances, voiture… (Entrée pour valider)"
      />
    </div>
  )
}
