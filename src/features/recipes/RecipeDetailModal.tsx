import { useState } from 'react'
import { ShoppingCart, ChefHat, Pencil, Trash2, Check } from 'lucide-react'
import { format } from 'date-fns'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import { useMember } from '../../auth/useMember'
import { useLogChore } from '../chores/useChores'
import { useAddRecipeToGroceries, mealMeta } from './useRecipes'
import type { Recipe } from './useRecipes'
import styles from './RecipesPage.module.css'

/**
 * Modale de détail d'une recette, partagée entre la feature Recettes et la
 * feature Tâches (recette liée à une tâche). `showCooked` masque « J'ai
 * cuisiné ! » quand on l'ouvre depuis une tâche (la tâche est l'action
 * gamifiée — éviter le double comptage de points).
 */
export default function RecipeDetailModal({ recipe, onClose, onEdit, onDelete, showCooked = true }: {
  recipe: Recipe
  onClose: () => void
  onEdit?: (recipe: Recipe) => void
  onDelete?: (recipe: Recipe) => void
  showCooked?: boolean
}) {
  const addToGroceries = useAddRecipeToGroceries()
  const logChore = useLogChore()
  const { data: member } = useMember()
  const { showToast } = useToast()
  const meta = mealMeta(recipe.meal_type)

  // Cases à cocher des ingrédients : suivi de préparation local à l'ouverture.
  const [checked, setChecked] = useState<Set<number>>(new Set())
  function toggleIngredient(idx: number) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function handleCooked() {
    if (!member) return
    logChore.mutate(
      {
        chore_id: null,
        assignment_id: null,
        member_id: member.id,
        done_on: format(new Date(), 'yyyy-MM-dd'),
        label: `🍳 ${recipe.title}`,
        points: recipe.points,
      },
      { onSuccess: () => showToast({ type: 'success', message: `Bravo ! +${recipe.points} points pour « ${recipe.title} ».` }) },
    )
    onClose()
  }

  return (
    <SlideUpModal title={recipe.title} onClose={onClose}>
      <div className={styles.detail}>
        <div className={styles.detailHero}>
          <span className={[styles.detailHeroEmoji, styles[`tile_${recipe.meal_type}`] ?? ''].join(' ')} aria-hidden="true">
            {meta.emoji}
          </span>
          <div className={styles.detailBadges}>
            <span className={[styles.cardBadge, styles[`badge_${recipe.meal_type}`] ?? ''].join(' ')}>{meta.label}</span>
            <span className={styles.detailBadge}>🥕 {recipe.ingredients.length} ingrédient{recipe.ingredients.length > 1 ? 's' : ''}</span>
            <span className={styles.detailBadge}>📋 {recipe.steps.length} étape{recipe.steps.length > 1 ? 's' : ''}</span>
            <span className={styles.detailBadge}>🏆 {recipe.points} pts</span>
          </div>
        </div>

        {recipe.ingredients.length > 0 && (
          <button
            className={styles.actionPrimary}
            onClick={() => addToGroceries.mutate(recipe.ingredients)}
            disabled={addToGroceries.isPending}
          >
            <ShoppingCart size={15} strokeWidth={2} /> Ajouter les ingrédients aux courses
          </button>
        )}

        {recipe.ingredients.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.detailH}>Ingrédients</h3>
            <ul className={styles.ingList}>
              {recipe.ingredients.map((i, idx) => {
                const done = checked.has(idx)
                return (
                  <li key={idx}>
                    <button
                      className={styles.ingCheck}
                      onClick={() => toggleIngredient(idx)}
                      aria-pressed={done}
                    >
                      <span className={[styles.ingBox, done ? styles.ingBoxChecked : ''].join(' ')} aria-hidden="true">
                        {done && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className={[styles.ingName, done ? styles.ingNameDone : ''].join(' ')}>{i.name}</span>
                      {i.quantity && <span className={styles.ingQty}>{i.quantity}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {recipe.steps.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.detailH}>Préparation</h3>
            <ol className={styles.stepList}>
              {recipe.steps.map((s, idx) => (
                <li key={idx} className={styles.stepItem}>
                  <span className={styles.stepNum} aria-hidden="true">{idx + 1}</span>
                  <span className={styles.stepText}>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className={styles.detailActions}>
          {showCooked && (
            <button className={styles.actionPrimary} onClick={handleCooked}>
              <ChefHat size={15} strokeWidth={2} /> J'ai cuisiné ! · +{recipe.points}
            </button>
          )}
          {onEdit && (
            <button className={styles.actionSecondary} onClick={() => onEdit(recipe)}>
              <Pencil size={15} strokeWidth={2} /> Modifier
            </button>
          )}
          {onDelete && (
            <button className={[styles.actionSecondary, styles.actionDanger].join(' ')} onClick={() => onDelete(recipe)}>
              <Trash2 size={15} strokeWidth={2} /> Supprimer
            </button>
          )}
        </div>
      </div>
    </SlideUpModal>
  )
}
