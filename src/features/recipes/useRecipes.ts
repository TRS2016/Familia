import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { GROCERIES_KEY } from '../groceries/useGroceries'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MealType = 'petit_dej' | 'dejeuner' | 'collation' | 'diner'

export const MEAL_TYPES: MealType[] = ['petit_dej', 'dejeuner', 'collation', 'diner']

// Libellé + emoji + points gagnés en cuisinant (gamification des tâches).
export const MEAL_META: Record<MealType, { label: string; emoji: string; points: number }> = {
  petit_dej: { label: 'Petit-déj', emoji: '🥐', points: 5 },
  dejeuner:  { label: 'Déjeuner',  emoji: '🍽️', points: 10 },
  collation: { label: 'Collation', emoji: '🍎', points: 5 },
  diner:     { label: 'Dîner',     emoji: '🌙', points: 15 },
}

export function mealMeta(t: string) {
  return MEAL_META[t as MealType] ?? { label: t, emoji: '🍴', points: 10 }
}

export interface Ingredient { name: string; quantity: string }

export interface Recipe {
  id: string
  household_id: string
  title: string
  meal_type: string
  ingredients: Ingredient[]
  steps: string[]
  points: number
  created_by: string | null
  created_at: string
  member: { display_name: string } | null
}

// Forme renvoyée par l'edge parse-recipes (avant normalisation/insertion).
interface ParsedRecipe {
  title?: string
  meal_type?: string
  ingredients?: { name?: string; quantity?: string }[]
  steps?: string[]
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const RECIPES_KEY = ['recipes', HOUSEHOLD_ID] as const

const SELECT = '*, member:members(display_name)'

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useRecipes() {
  return useQuery({
    queryKey: RECIPES_KEY,
    queryFn: async (): Promise<Recipe[]> => {
      const { data, error } = await supabase
        .from('recipes')
        .select(SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as Recipe[]).map(r => ({
        ...r,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        steps: Array.isArray(r.steps) ? r.steps : [],
      }))
    },
  })
}

export function useRecipesRealtime() {
  useRealtimeInvalidation('recipes-changes', [
    { table: 'recipes', keys: [RECIPES_KEY] },
  ])
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: RECIPES_KEY })
      const previous = queryClient.getQueryData<Recipe[]>(RECIPES_KEY) ?? []
      queryClient.setQueryData<Recipe[]>(RECIPES_KEY, previous.filter(r => r.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(RECIPES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer la recette.' })
    },
  })
}

/** Ajoute les ingrédients d'une recette à la liste de courses (insert en lot). */
export function useAddRecipeToGroceries() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (ingredients: Ingredient[]): Promise<number> => {
      const rows = ingredients
        .filter(i => i.name.trim())
        .map(i => ({
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
          name: i.name.trim(),
          quantity: i.quantity.trim() || null,
        }))
      if (rows.length === 0) return 0
      const { error } = await supabase.from('groceries').insert(rows as never)
      if (error) throw error
      return rows.length
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: GROCERIES_KEY })
      showToast({ type: 'success', message: `${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la liste de courses.` })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'ajouter à la liste.' }),
  })
}

/** Import IA : envoie le PDF (base64) à l'edge parse-recipes puis insère les recettes. */
export function useImportRecipes() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (pdfBase64: string): Promise<{ count: number; truncated: boolean }> => {
      const { data, error } = await supabase.functions.invoke('parse-recipes', { body: { pdf: pdfBase64 } })
      if (error) {
        // L'edge renvoie un message lisible dans le corps même en cas d'erreur.
        let msg = 'Lecture du PDF impossible.'
        try { msg = (await error.context?.json())?.error ?? msg } catch { /* garde le défaut */ }
        throw new Error(msg)
      }
      const recipes = (data?.recipes ?? []) as ParsedRecipe[]
      if (recipes.length === 0) throw new Error('Aucune recette détectée dans ce PDF.')

      const rows = recipes
        .filter(r => (r.title ?? '').trim())
        .map(r => {
          const meal_type = MEAL_TYPES.includes(r.meal_type as MealType) ? r.meal_type! : 'dejeuner'
          return {
            household_id: HOUSEHOLD_ID,
            created_by: member?.id ?? null,
            title: r.title!.trim(),
            meal_type,
            ingredients: (r.ingredients ?? [])
              .filter(i => (i.name ?? '').trim())
              .map(i => ({ name: i.name!.trim(), quantity: (i.quantity ?? '').trim() })),
            steps: (r.steps ?? []).map(s => String(s).trim()).filter(Boolean),
            points: mealMeta(meal_type).points,
          }
        })

      const { error: insErr } = await supabase.from('recipes').insert(rows as never)
      if (insErr) throw insErr
      return { count: rows.length, truncated: !!data?.truncated }
    },
    onSuccess: ({ count, truncated }) => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      showToast({
        type: 'success',
        message: `${count} recette${count > 1 ? 's' : ''} importée${count > 1 ? 's' : ''}${truncated ? ' (PDF tronqué — relance sur le reste)' : ''}.`,
      })
    },
    onError: (e: Error) => {
      showToast({ type: 'error', message: e.message })
    },
  })
}
