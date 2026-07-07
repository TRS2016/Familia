import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { addDays, format, isToday, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import SlideUpModal from '../../components/SlideUpModal'
import Spinner from '../../components/Spinner'
import { useToast } from '../../components/useToast'
import { useHouseholdMembers } from '../chores/useChores'
import { MEAL_TYPES, mealMeta } from './useRecipes'
import type { MealType, Recipe } from './useRecipes'
import {
  useMealPlanWeek, useSetMealPlanEntry, useRemoveMealPlanEntry,
  useAddWeekToGroceries, weekStartISO, weekDays,
} from './useMealPlan'
import styles from './RecipesPage.module.css'

/**
 * Vue « Semaine » : planning des repas (7 jours × 4 créneaux). Un créneau =
 * une recette du carnet ; le bouton du bas ajoute tous les ingrédients de la
 * semaine à la liste de courses.
 */
export default function WeekPlanner({ recipes, onShowRecipe }: {
  recipes: Recipe[]
  onShowRecipe: (r: Recipe) => void
}) {
  const [weekStart, setWeekStart] = useState(() => weekStartISO(new Date()))
  const [picker, setPicker] = useState<{ date: string; meal_type: MealType } | null>(null)

  const { data: entries = [], isLoading } = useMealPlanWeek(weekStart)
  const { data: members = [] } = useHouseholdMembers()
  const { showToast } = useToast()
  const setEntry = useSetMealPlanEntry()
  const removeEntry = useRemoveMealPlanEntry()
  const addWeek = useAddWeekToGroceries()

  // Rotation « qui cuisine » : stable par date (numéro de jour absolu), donc
  // identique sur tous les appareils sans rien stocker. Purement indicatif.
  function cookFor(date: string) {
    if (members.length < 2) return null
    return members[Math.floor(Date.parse(date + 'T12:00') / 86400000) % members.length]
  }

  // 🎲 : tire une recette au hasard du carnet et la planifie sur son créneau.
  function rollDay(date: string) {
    if (recipes.length === 0) return
    const r = recipes[Math.floor(Math.random() * recipes.length)]
    setEntry.mutate(
      { date, meal_type: r.meal_type as MealType, recipe_id: r.id },
      { onSuccess: () => showToast({ type: 'success', message: `🎲 « ${r.title} » ajouté au planning.` }) },
    )
  }

  const recipeById = useMemo(() => new Map(recipes.map(r => [r.id, r])), [recipes])
  const entryBySlot = useMemo(() => {
    const m = new Map<string, typeof entries[number]>()
    for (const e of entries) m.set(`${e.date}|${e.meal_type}`, e)
    return m
  }, [entries])

  const days = weekDays(weekStart)
  const plannedRecipes = useMemo(
    () => entries.map(e => recipeById.get(e.recipe_id)).filter((r): r is Recipe => !!r),
    [entries, recipeById],
  )

  function shiftWeek(delta: number) {
    setWeekStart(w => format(addDays(parseISO(w), delta * 7), 'yyyy-MM-dd'))
  }

  const currentEntry = picker ? entryBySlot.get(`${picker.date}|${picker.meal_type}`) : undefined
  const currentRecipe = currentEntry ? recipeById.get(currentEntry.recipe_id) : undefined

  // Recettes du type du créneau d'abord, puis les autres.
  const pickerRecipes = useMemo(() => {
    if (!picker) return { suggested: [], others: [] }
    return {
      suggested: recipes.filter(r => r.meal_type === picker.meal_type),
      others: recipes.filter(r => r.meal_type !== picker.meal_type),
    }
  }, [picker, recipes])

  function pick(recipeId: string) {
    if (!picker) return
    setEntry.mutate({ date: picker.date, meal_type: picker.meal_type, recipe_id: recipeId })
    setPicker(null)
  }

  return (
    <div className={styles.planner}>
      <div className={styles.plannerNav}>
        <button className={styles.plannerNavBtn} onClick={() => shiftWeek(-1)} aria-label="Semaine précédente">
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <button
          className={styles.plannerNavLabel}
          onClick={() => setWeekStart(weekStartISO(new Date()))}
          title="Revenir à la semaine courante"
        >
          Semaine du {format(parseISO(weekStart), 'd MMMM', { locale: fr })}
        </button>
        <button className={styles.plannerNavBtn} onClick={() => shiftWeek(1)} aria-label="Semaine suivante">
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      </div>

      {isLoading ? (
        <div className={styles.spinnerWrap}><Spinner size={28} /></div>
      ) : (
        <div className={styles.plannerDays}>
          {days.map(d => {
            const dt = parseISO(d)
            const cook = cookFor(d)
            const dayEmpty = !MEAL_TYPES.some(t => entryBySlot.has(`${d}|${t}`))
            return (
              <div key={d} className={[styles.plannerDay, isToday(dt) ? styles.plannerDayToday : ''].join(' ')}>
                <div className={styles.plannerDayHead}>
                  <span className={styles.plannerDayLabel}>
                    {format(dt, 'EEEE d', { locale: fr })}
                    {dayEmpty && <span className={styles.plannerDayEmpty}> · à définir</span>}
                  </span>
                  {cook && <span className={styles.cookChip}>👨‍🍳 {cook.display_name}</span>}
                  {dayEmpty && recipes.length > 0 && (
                    <button
                      className={styles.diceBtn}
                      onClick={() => rollDay(d)}
                      disabled={setEntry.isPending}
                      aria-label="Tirer une recette au hasard pour ce jour"
                      title="Tirer une recette au hasard"
                    >
                      🎲
                    </button>
                  )}
                </div>
                <div className={styles.plannerSlots}>
                  {MEAL_TYPES.map(t => {
                    const meta = mealMeta(t)
                    const entry = entryBySlot.get(`${d}|${t}`)
                    const recipe = entry ? recipeById.get(entry.recipe_id) : undefined
                    return (
                      <button
                        key={t}
                        className={[styles.plannerSlot, recipe ? styles.plannerSlotFilled : ''].join(' ')}
                        onClick={() => setPicker({ date: d, meal_type: t })}
                        title={recipe ? `${meta.label} : ${recipe.title}` : `Planifier le ${meta.label.toLowerCase()}`}
                      >
                        <span aria-hidden="true">{meta.emoji}</span>
                        {recipe
                          ? <span className={styles.plannerSlotTitle}>{recipe.title}</span>
                          : <Plus size={12} strokeWidth={2.5} className={styles.plannerSlotPlus} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        className={styles.actionPrimary}
        onClick={() => addWeek.mutate(plannedRecipes)}
        disabled={plannedRecipes.length === 0 || addWeek.isPending}
      >
        {addWeek.isPending
          ? <Spinner size={14} />
          : <><ShoppingCart size={15} strokeWidth={2} /> Ajouter la semaine aux courses</>}
      </button>

      {picker && (
        <SlideUpModal
          title={`${mealMeta(picker.meal_type).emoji} ${mealMeta(picker.meal_type).label} · ${format(parseISO(picker.date), 'EEEE d MMMM', { locale: fr })}`}
          onClose={() => setPicker(null)}
        >
          <div className={styles.pickerBody}>
            {currentRecipe && currentEntry && (
              <div className={styles.pickerCurrent}>
                <button className={styles.pickerCurrentTitle} onClick={() => { setPicker(null); onShowRecipe(currentRecipe) }}>
                  {currentRecipe.title}
                </button>
                <button
                  className={styles.formRemove}
                  onClick={() => { removeEntry.mutate(currentEntry.id); setPicker(null) }}
                  aria-label="Retirer du planning"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </div>
            )}
            {recipes.length === 0 && (
              <p className={styles.pickerEmpty}>Aucune recette dans le carnet — ajoute ou importe des recettes d'abord.</p>
            )}
            {pickerRecipes.suggested.length > 0 && (
              <ul className={styles.pickerList}>
                {pickerRecipes.suggested.map(r => (
                  <li key={r.id}>
                    <button className={styles.pickerRow} onClick={() => pick(r.id)}>
                      <span className={styles.rowEmoji}>{mealMeta(r.meal_type).emoji}</span>
                      <span className={styles.pickerRowTitle}>{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pickerRecipes.others.length > 0 && (
              <>
                <p className={styles.pickerSection}>Autres recettes</p>
                <ul className={styles.pickerList}>
                  {pickerRecipes.others.map(r => (
                    <li key={r.id}>
                      <button className={styles.pickerRow} onClick={() => pick(r.id)}>
                        <span className={styles.rowEmoji}>{mealMeta(r.meal_type).emoji}</span>
                        <span className={styles.pickerRowTitle}>{r.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </SlideUpModal>
      )}
    </div>
  )
}
