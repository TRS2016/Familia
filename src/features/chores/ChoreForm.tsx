import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import { CHORE_CATEGORIES, categoryOf } from './categories'
import { EMOJI_PALETTE, WEEK_LABELS } from './chores.utils'
import type { Chore, NewChoreInput, HouseholdMember } from './useChores'
import { useRecipes, MEAL_TYPES, mealMeta } from '../recipes/useRecipes'
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
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [steps, setSteps] = useState<string[]>(initial?.steps ?? [])
  const [recipeId, setRecipeId] = useState<string | null>(initial?.recipe_id ?? null)
  const { data: recipes = [] } = useRecipes()

  function updateStep(i: number, val: string) { setSteps(prev => prev.map((s, j) => j === i ? val : s)) }
  function addStep() { setSteps(prev => [...prev, '']) }
  function removeStep(i: number) { setSteps(prev => prev.filter((_, j) => j !== i)) }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

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

  // Une rotation n'a de sens qu'à partir de 2 membres. Avec 1 seul sélectionné,
  // c'est une assignation fixe à ce membre.
  const rotating = rotation.length >= 2

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name, emoji, color: categoryOf(category).color, category, points,
      frequency,
      frequency_days: frequency === 'weekly' ? days : null,
      start_date: initial?.start_date ?? null,
      rotation_member_ids: rotating ? rotation : null,
      rotation_period: rotationPeriod,
      default_member_id: rotating ? null : (rotation.length === 1 ? rotation[0] : defaultMember),
      instructions: instructions.trim() || null,
      steps,
      recipe_id: recipeId,
    })
    onClose()
  }

  function pickRecipe(id: string) {
    setRecipeId(id || null)
    // Pré-remplit le nom si vide, pour une tâche « cuisiner ».
    if (id && !name.trim()) {
      const r = recipes.find(x => x.id === id)
      if (r) setName(`Cuisiner : ${r.title}`)
    }
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
          {rotating && (
            <div className={styles.chipRow} style={{ marginTop: 8 }}>
              {[['week', 'Chaque semaine'], ['day', 'Chaque jour']].map(([v, l]) => (
                <button type="button" key={v}
                  className={[styles.chip, rotationPeriod === v ? styles.chipActive : ''].join(' ')}
                  onClick={() => setRotationPeriod(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {rotation.length === 0 && (
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

        {recipes.length > 0 && (
          <label className={styles.field}>
            <span className={styles.label}>Recette liée (optionnel)</span>
            <select className={styles.input} value={recipeId ?? ''} onChange={e => pickRecipe(e.target.value)}>
              <option value="">Aucune</option>
              {MEAL_TYPES.map(t => {
                const inMeal = recipes.filter(r => r.meal_type === t)
                if (inMeal.length === 0) return null
                return (
                  <optgroup key={t} label={`${mealMeta(t).emoji} ${mealMeta(t).label}`}>
                    {inMeal.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.label}>Consignes / recette (optionnel)</span>
          <textarea className={styles.textarea} value={instructions} onChange={e => setInstructions(e.target.value)}
            rows={3} placeholder="Ex. recette, remarques, produits à utiliser…" />
        </label>

        <div className={styles.field}>
          <span className={styles.label}>Étapes à suivre (optionnel)</span>
          {steps.map((s, i) => (
            <div key={i} className={styles.stepEditRow}>
              <span className={styles.stepNum}>{i + 1}</span>
              <input className={styles.input} value={s} onChange={e => updateStep(i, e.target.value)}
                placeholder={`Étape ${i + 1}`} />
              <button type="button" className={styles.iconBtn} onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Monter">↑</button>
              <button type="button" className={styles.iconBtn} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Descendre">↓</button>
              <button type="button" className={styles.iconBtn} onClick={() => removeStep(i)} aria-label="Retirer">✕</button>
            </div>
          ))}
          <button type="button" className={styles.addStepBtn} onClick={addStep}>+ Ajouter une étape</button>
        </div>

        <button type="submit" className={styles.submitBtn}>
          {initial ? 'Enregistrer' : 'Créer la tâche'}
        </button>
      </form>
    </SlideUpModal>
  )
}
