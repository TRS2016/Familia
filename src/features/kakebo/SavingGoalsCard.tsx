import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { fmtEur } from './kakebo.utils'
import {
  useSavingGoals, useArchivedSavingGoals, useSavingGoalTotals, useUpsertSavingGoal, useArchiveSavingGoal,
  type SavingGoal,
} from './useSavingGoals'
import styles from './KakeboPage.module.css'

const GOAL_EMOJIS = ['🎯', '🏖️', '🏠', '🚗', '💍', '🎓', '👶', '🛠️', '✈️', '🎁', '💻', '🚴']

/**
 * Projets d'épargne : enveloppes nommées avec objectif, alimentées par les
 * opérations de type « épargne » rattachées à un projet. Progression = cumul
 * de toutes les opérations liées (tous mois confondus).
 */
export default function SavingGoalsCard() {
  const { data: goals = [] } = useSavingGoals()
  const { data: archived = [] } = useArchivedSavingGoals()
  const { data: totals = {} } = useSavingGoalTotals()
  const upsertGoal = useUpsertSavingGoal()
  const archiveGoal = useArchiveSavingGoal()

  // false = fermé ; null = création ; SavingGoal = édition
  const [form, setForm] = useState<SavingGoal | null | false>(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [target, setTarget] = useState('')

  function openForm(goal: SavingGoal | null) {
    setName(goal?.name ?? '')
    setEmoji(goal?.emoji ?? '🎯')
    setTarget(goal ? String(goal.target_amount) : '')
    setForm(goal)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = parseFloat(target.replace(',', '.'))
    if (!name.trim() || isNaN(amount) || amount <= 0) return
    upsertGoal.mutate(
      { id: form && form !== null ? form.id : undefined, name, emoji, target_amount: amount },
      { onSuccess: () => setForm(false) },
    )
  }

  return (
    <div className={styles.goalsCard}>
      <div className={styles.goalsHead}>
        <span className={styles.goalsTitle}>🎯 Projets d'épargne</span>
        <button className={styles.goalsAdd} onClick={() => openForm(null)}>
          <Plus size={13} strokeWidth={2.5} /> Projet
        </button>
      </div>

      {goals.length === 0 ? (
        <p className={styles.goalsHint}>
          Crée une enveloppe (« Vacances », « Travaux »…) puis rattache-lui tes virements d'épargne à l'ajout d'une opération.
        </p>
      ) : (
        <div className={styles.goalsList}>
          {goals.map(g => {
            const saved = totals[g.id] ?? 0
            const pct = Math.max(0, Math.min(100, Math.round((saved / g.target_amount) * 100)))
            const reached = saved >= g.target_amount
            return (
              <div key={g.id} className={styles.goalItem}>
                <div className={styles.goalItemHead}>
                  <span className={styles.goalItemName}>{g.emoji} {g.name}{reached ? ' 🎉' : ''}</span>
                  <button className={styles.goalItemEdit} onClick={() => openForm(g)} aria-label={`Modifier ${g.name}`}>
                    <Pencil size={13} strokeWidth={2} />
                  </button>
                </div>
                <div className={styles.goalTrack}>
                  <div
                    className={styles.goalFill}
                    style={{ width: `${pct}%`, background: reached ? '#5B9E8F' : '#3D80B8' }}
                  />
                </div>
                <span className={styles.goalItemMeta}>
                  {fmtEur(saved)} € / {fmtEur(g.target_amount)} € · {pct}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Projets archivés portant encore des versements : sans cette section
          leurs opérations devenaient invisibles et le cumul introuvable. */}
      {archived.some(g => (totals[g.id] ?? 0) > 0) && (
        <details className={styles.goalsArchived}>
          <summary className={styles.goalsArchivedSummary}>
            Projets archivés ({archived.filter(g => (totals[g.id] ?? 0) > 0).length})
          </summary>
          {archived.filter(g => (totals[g.id] ?? 0) > 0).map(g => (
            <div key={g.id} className={styles.goalsArchivedRow}>
              <span className={styles.goalItemName}>{g.emoji} {g.name}</span>
              <span className={styles.goalItemMeta}>{fmtEur(totals[g.id] ?? 0)} €</span>
              <button
                className={styles.goalsUnarchive}
                onClick={() => archiveGoal.mutate({ id: g.id, archived: false })}
              >
                Réactiver
              </button>
            </div>
          ))}
        </details>
      )}

      {form !== false && (
        <SlideUpModal title={form ? 'Modifier le projet' : 'Nouveau projet d\'épargne'} onClose={() => setForm(false)}>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="sg-name" className={styles.fieldLabel}>Nom</label>
              <input
                id="sg-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex. Vacances, Travaux…"
                required
                autoFocus={!form}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Emoji</label>
              <div className={styles.catPills}>
                {GOAL_EMOJIS.map(em => (
                  <button
                    key={em}
                    type="button"
                    className={[styles.catPill, emoji === em ? styles.catPillActive : ''].join(' ')}
                    onClick={() => setEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="sg-target" className={styles.fieldLabel}>Objectif (€)</label>
              <input
                id="sg-target"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                className={styles.input}
                value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="1500"
                required
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={upsertGoal.isPending}>
              {form ? 'Enregistrer' : 'Créer le projet'}
            </button>
            {form && (
              <button
                type="button"
                className={styles.goalArchiveBtn}
                onClick={() => archiveGoal.mutate({ id: form.id, archived: true }, { onSuccess: () => setForm(false) })}
              >
                Archiver ce projet (l'historique est conservé)
              </button>
            )}
          </form>
        </SlideUpModal>
      )}
    </div>
  )
}
