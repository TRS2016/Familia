import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import Spinner from '../../components/Spinner'
import { useSaveRecipe, MEAL_TYPES, mealMeta } from './useRecipes'
import type { Ingredient, MealType, Recipe } from './useRecipes'
import styles from './RecipesPage.module.css'

/**
 * Formulaire de recette : création manuelle (recipe absent) ou édition
 * (recipe présent — permet de corriger une recette mal parsée par l'IA).
 */
export default function RecipeFormModal({ recipe, onClose }: {
  recipe?: Recipe | null
  onClose: () => void
}) {
  const saveRecipe = useSaveRecipe()

  const [title, setTitle] = useState(recipe?.title ?? '')
  const [mealType, setMealType] = useState<MealType>(
    (MEAL_TYPES.includes(recipe?.meal_type as MealType) ? recipe!.meal_type : 'dejeuner') as MealType,
  )
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients.length ? recipe.ingredients : [{ name: '', quantity: '' }],
  )
  const [steps, setSteps] = useState<string[]>(recipe?.steps.length ? recipe.steps : [''])

  function setIngredient(idx: number, patch: Partial<Ingredient>) {
    setIngredients(list => list.map((i, k) => k === idx ? { ...i, ...patch } : i))
  }

  function handleSave() {
    saveRecipe.mutate(
      { id: recipe?.id, title, meal_type: mealType, ingredients, steps },
      { onSuccess: onClose },
    )
  }

  return (
    <SlideUpModal title={recipe ? 'Modifier la recette' : 'Nouvelle recette'} onClose={onClose}>
      <div className={styles.form}>
        <label className={styles.formLabel}>
          Titre
          <input
            className={styles.formInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Gratin de courgettes"
            autoFocus={!recipe}
          />
        </label>

        <div className={styles.formLabel}>
          Type de repas
          <div className={styles.filterRow} style={{ padding: 0 }}>
            {MEAL_TYPES.map(t => {
              const meta = mealMeta(t)
              return (
                <button
                  key={t}
                  type="button"
                  className={[styles.chip, mealType === t ? styles.chipActive : ''].join(' ')}
                  onClick={() => setMealType(t)}
                >
                  {meta.emoji} {meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.formLabel}>
          Ingrédients
          {ingredients.map((ing, idx) => (
            <div key={idx} className={styles.formRow}>
              <input
                className={styles.formInput}
                value={ing.name}
                onChange={e => setIngredient(idx, { name: e.target.value })}
                placeholder="Ingrédient"
              />
              <input
                className={[styles.formInput, styles.formInputQty].join(' ')}
                value={ing.quantity}
                onChange={e => setIngredient(idx, { quantity: e.target.value })}
                placeholder="Qté"
              />
              <button
                type="button"
                className={styles.formRemove}
                onClick={() => setIngredients(list => list.filter((_, k) => k !== idx))}
                aria-label="Retirer l'ingrédient"
              >
                <Trash2 size={15} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.formAdd}
            onClick={() => setIngredients(list => [...list, { name: '', quantity: '' }])}
          >
            <Plus size={14} strokeWidth={2.5} /> Ingrédient
          </button>
        </div>

        <div className={styles.formLabel}>
          Préparation
          {steps.map((s, idx) => (
            <div key={idx} className={styles.formRow}>
              <span className={styles.formStepNum}>{idx + 1}.</span>
              <textarea
                className={[styles.formInput, styles.formStepArea].join(' ')}
                value={s}
                onChange={e => setSteps(list => list.map((v, k) => k === idx ? e.target.value : v))}
                placeholder="Étape"
                rows={2}
              />
              <button
                type="button"
                className={styles.formRemove}
                onClick={() => setSteps(list => list.filter((_, k) => k !== idx))}
                aria-label="Retirer l'étape"
              >
                <Trash2 size={15} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.formAdd}
            onClick={() => setSteps(list => [...list, ''])}
          >
            <Plus size={14} strokeWidth={2.5} /> Étape
          </button>
        </div>

        <button
          type="button"
          className={styles.actionPrimary}
          onClick={handleSave}
          disabled={!title.trim() || saveRecipe.isPending}
        >
          {saveRecipe.isPending ? <Spinner size={14} /> : (recipe ? 'Enregistrer' : 'Ajouter')}
        </button>
      </div>
    </SlideUpModal>
  )
}
