import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { MEAL_TYPES, mealMeta } from './useRecipes'
import styles from './MealPlanHomeWidget.module.css'

interface TodayMeal {
  id: string
  meal_type: string
  recipe: { title: string } | null
}

/** Widget Home : les repas planifiés du jour. Rendu nul si rien n'est prévu. */
export default function MealPlanHomeWidget() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: meals = [] } = useQuery({
    queryKey: ['meal-plan', HOUSEHOLD_ID, 'today', today],
    queryFn: async (): Promise<TodayMeal[]> => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('id, meal_type, recipe:recipes(title)')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('date', today)
      if (error) throw error
      return data as unknown as TodayMeal[]
    },
  })

  if (meals.length === 0) return null

  const order = new Map(MEAL_TYPES.map((t, i) => [t as string, i]))
  const sorted = [...meals].sort(
    (a, b) => (order.get(a.meal_type) ?? 9) - (order.get(b.meal_type) ?? 9),
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>Repas du jour</span>
        <Link to="/recipes" className={styles.seeAll}>Planning</Link>
      </div>
      <Link to="/recipes" className={styles.card}>
        <ul className={styles.list}>
          {sorted.map(m => {
            const meta = mealMeta(m.meal_type)
            return (
              <li key={m.id} className={styles.row}>
                <span className={styles.emoji} aria-hidden="true">{meta.emoji}</span>
                <span className={styles.meal}>{meta.label}</span>
                <span className={styles.recipe}>{m.recipe?.title ?? '—'}</span>
              </li>
            )
          })}
        </ul>
      </Link>
    </div>
  )
}
