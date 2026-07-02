import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { GROCERIES_KEY } from '../groceries/useGroceries'
import type { Ingredient, MealType, Recipe } from './useRecipes'

// ── Types & helpers ───────────────────────────────────────────────────────────

export interface MealPlanEntry {
  id: string
  date: string      // 'yyyy-MM-dd'
  meal_type: string
  recipe_id: string
}

export const MEAL_PLAN_KEY = ['meal-plan', HOUSEHOLD_ID] as const

/** Lundi de la semaine contenant `d`, au format ISO. */
export function weekStartISO(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/** Les 7 dates ISO de la semaine commençant à `weekStart`. */
export function weekDays(weekStart: string): string[] {
  const start = parseISO(weekStart)
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'))
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMealPlanWeek(weekStart: string) {
  return useQuery({
    queryKey: [...MEAL_PLAN_KEY, weekStart],
    queryFn: async (): Promise<MealPlanEntry[]> => {
      const end = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .select('id, date, meal_type, recipe_id')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', weekStart)
        .lte('date', end)
      if (error) throw error
      return data
    },
  })
}

/** Assigne une recette à un créneau (remplace l'existante du créneau si besoin). */
export function useSetMealPlanEntry() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: { date: string; meal_type: MealType; recipe_id: string }) => {
      const { error } = await supabase.from('meal_plan_entries').upsert(
        {
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
          date: input.date,
          meal_type: input.meal_type,
          recipe_id: input.recipe_id,
        } as never,
        { onConflict: 'household_id,date,meal_type' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEAL_PLAN_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de planifier ce repas.' }),
  })
}

export function useRemoveMealPlanEntry() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEAL_PLAN_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de retirer ce repas.' }),
  })
}

/**
 * Ajoute les ingrédients de toutes les recettes planifiées de la semaine à la
 * liste de courses. Agrégation par nom (insensible à la casse) : les quantités
 * non vides sont concaténées (« 200 g + 100 g ») — l'utilisateur ajuste en magasin.
 */
export function useAddWeekToGroceries() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (recipes: Recipe[]): Promise<number> => {
      const byName = new Map<string, { name: string; quantities: string[] }>()
      for (const r of recipes) {
        for (const ing of r.ingredients as Ingredient[]) {
          const name = ing.name.trim()
          if (!name) continue
          const key = name.toLowerCase()
          const agg = byName.get(key) ?? { name, quantities: [] }
          if (ing.quantity.trim()) agg.quantities.push(ing.quantity.trim())
          byName.set(key, agg)
        }
      }
      const rows = [...byName.values()].map(a => ({
        household_id: HOUSEHOLD_ID,
        created_by: member?.id ?? null,
        name: a.name,
        quantity: a.quantities.length > 0 ? a.quantities.join(' + ') : null,
      }))
      if (rows.length === 0) return 0
      const { error } = await supabase.from('groceries').insert(rows as never)
      if (error) throw error
      return rows.length
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: GROCERIES_KEY })
      showToast({
        type: 'success',
        message: n === 0
          ? 'Aucun ingrédient dans les recettes planifiées.'
          : `${n} ingrédient${n > 1 ? 's' : ''} de la semaine ajouté${n > 1 ? 's' : ''} aux courses.`,
      })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'ajouter aux courses.' }),
  })
}
