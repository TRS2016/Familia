import { Link } from 'react-router-dom'
import { Check, Plus, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useLogChore } from '../features/chores/useChores'
import { useAddRecipeToGroceries } from '../features/recipes/useRecipes'
import type { DigestItem } from './useHomeDigest'
import styles from './HomeNowBand.module.css'

interface Props {
  items: DigestItem[]
  hiddenCount: number
  currentMemberId: string
  /** Affiché quand rien n'est urgent : le bandeau reste un repère fiable. */
  allClearName: string
}

/**
 * Le bandeau « Maintenant » : un flux unique, classé par urgence et non par
 * feature, où chaque ligne se règle sur place.
 *
 * Il ne disparaît jamais. Un tableau de bord qui s'efface quand tout va bien
 * n'apprend rien : on ne sait pas distinguer « rien à faire » de « pas encore
 * chargé ».
 */
export default function HomeNowBand({ items, hiddenCount, currentMemberId, allClearName }: Props) {
  const logChore = useLogChore()
  const addToGroceries = useAddRecipeToGroceries()

  if (items.length === 0) {
    return (
      <section className={styles.band} aria-label="À faire maintenant">
        <div className={styles.head}>
          <span className={styles.headLabel}>⚡ Maintenant</span>
        </div>
        <div className={[styles.card, styles.clearCard].join(' ')}>
          <span className={styles.clearEmoji} aria-hidden="true">🌿</span>
          <div>
            <p className={styles.clearTitle}>Tout est à jour</p>
            <p className={styles.clearSub}>
              Rien en retard, {allClearName}. Profite.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.band} aria-label="À faire maintenant">
      <div className={styles.head}>
        <span className={styles.headLabel}>⚡ Maintenant</span>
        <span className={styles.headCount}>{items.length}</span>
      </div>

      <ul className={styles.card}>
        {items.map(item => {
          // Const locale plutôt que `item.action` : TypeScript peut alors
          // affiner le type discriminé à l'intérieur des callbacks.
          const action = item.action
          const urgent = item.kind === 'chore-overdue' || item.kind === 'budget-tight'
          return (
            <li key={item.id} className={[styles.row, urgent ? styles.rowUrgent : ''].join(' ')}>
              <span className={styles.emoji} aria-hidden="true">{item.emoji}</span>

              <Link to={item.to} className={styles.body}>
                <span className={styles.label}>{item.label}</span>
                <span className={[styles.meta, urgent ? styles.metaUrgent : ''].join(' ')}>
                  {item.meta}
                </span>
              </Link>

              {action?.type === 'chore-done' && (
                <button
                  className={styles.actionDone}
                  disabled={logChore.isPending}
                  onClick={() => {
                    navigator.vibrate?.(40)
                    logChore.mutate({
                      chore_id: action.choreId,
                      assignment_id: action.assignmentId,
                      member_id: currentMemberId,
                      done_on: format(new Date(), 'yyyy-MM-dd'),
                    })
                  }}
                  aria-label={`Marquer « ${item.label} » comme faite`}
                  title={item.actionLabel}
                >
                  <Check size={17} strokeWidth={2.8} />
                </button>
              )}

              {action?.type === 'add-ingredients' && (
                <button
                  className={styles.actionAdd}
                  disabled={addToGroceries.isPending}
                  onClick={() => {
                    addToGroceries.mutate(action.ingredients)
                  }}
                  aria-label={`Ajouter les ingrédients manquants de « ${item.label} » aux courses`}
                >
                  <Plus size={15} strokeWidth={2.8} />
                  <span>{item.actionLabel}</span>
                </button>
              )}

              {!action && (
                <Link to={item.to} className={styles.actionLink} aria-label={`Ouvrir ${item.label}`}>
                  <ChevronRight size={18} strokeWidth={2.5} />
                </Link>
              )}
            </li>
          )
        })}
      </ul>

      {hiddenCount > 0 && (
        <Link to="/chores" className={styles.more}>
          +{hiddenCount} autre{hiddenCount > 1 ? 's' : ''} point{hiddenCount > 1 ? 's' : ''} d'attention
        </Link>
      )}
    </section>
  )
}
