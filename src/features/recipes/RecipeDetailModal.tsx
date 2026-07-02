import { ShoppingCart, ChefHat, Pencil } from 'lucide-react'
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
export default function RecipeDetailModal({ recipe, onClose, onEdit, showCooked = true }: {
  recipe: Recipe
  onClose: () => void
  onEdit?: (recipe: Recipe) => void
  showCooked?: boolean
}) {
  const addToGroceries = useAddRecipeToGroceries()
  const logChore = useLogChore()
  const { data: member } = useMember()
  const { showToast } = useToast()
  const meta = mealMeta(recipe.meal_type)

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
        <span className={styles.detailMeal}>{meta.emoji} {meta.label}</span>

        <div className={styles.detailActions}>
          {onEdit && (
            <button
              className={styles.actionSecondary}
              onClick={() => onEdit(recipe)}
            >
              <Pencil size={15} strokeWidth={2} /> Modifier
            </button>
          )}
          {recipe.ingredients.length > 0 && (
            <button
              className={styles.actionSecondary}
              onClick={() => addToGroceries.mutate(recipe.ingredients)}
              disabled={addToGroceries.isPending}
            >
              <ShoppingCart size={15} strokeWidth={2} /> Ajouter aux courses
            </button>
          )}
          {showCooked && (
            <button className={styles.actionPrimary} onClick={handleCooked}>
              <ChefHat size={15} strokeWidth={2} /> J'ai cuisiné ! · +{recipe.points}
            </button>
          )}
        </div>

        {recipe.ingredients.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.detailH}>Ingrédients</h3>
            <ul className={styles.ingList}>
              {recipe.ingredients.map((i, idx) => (
                <li key={idx} className={styles.ingItem}>
                  <span>{i.name}</span>
                  {i.quantity && <span className={styles.ingQty}>{i.quantity}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.steps.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.detailH}>Préparation</h3>
            <ol className={styles.stepList}>
              {recipe.steps.map((s, idx) => <li key={idx} className={styles.stepItem}>{s}</li>)}
            </ol>
          </section>
        )}
      </div>
    </SlideUpModal>
  )
}
