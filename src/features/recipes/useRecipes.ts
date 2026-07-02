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

/** Création ou édition manuelle d'une recette (corrige aussi les erreurs de parsing IA). */
export function useSaveRecipe() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      title: string
      meal_type: MealType
      ingredients: Ingredient[]
      steps: string[]
    }) => {
      const fields = {
        title: input.title.trim(),
        meal_type: input.meal_type,
        ingredients: input.ingredients
          .filter(i => i.name.trim())
          .map(i => ({ name: i.name.trim(), quantity: i.quantity.trim() })),
        steps: input.steps.map(s => s.trim()).filter(Boolean),
        points: mealMeta(input.meal_type).points,
      }
      if (input.id) {
        const { error } = await supabase.from('recipes').update(fields as never).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('recipes').insert({
          ...fields,
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
        } as never)
        if (error) throw error
      }
      return !!input.id
    },
    onSuccess: (edited) => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      showToast({ type: 'success', message: edited ? 'Recette modifiée.' : 'Recette ajoutée.' })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer la recette.' }),
  })
}

/** Import IA : envoie le PDF (base64) à l'edge parse-recipes puis insère les recettes. */
export function useImportRecipes() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (pdfBase64: string): Promise<{ count: number; skipped: number; truncated: boolean }> => {
      const { data, error } = await supabase.functions.invoke('parse-recipes', { body: { pdf: pdfBase64 } })
      if (error) {
        // L'edge renvoie un message lisible dans le corps même en cas d'erreur.
        let msg = 'Lecture du PDF impossible.'
        try { msg = (await error.context?.json())?.error ?? msg } catch { /* garde le défaut */ }
        throw new Error(msg)
      }
      const recipes = (data?.recipes ?? []) as ParsedRecipe[]
      if (recipes.length === 0) throw new Error('Aucune recette détectée dans ce PDF.')

      // Dédup : un réimport du même PDF ne doit pas dupliquer les recettes.
      const { data: existing, error: exErr } = await supabase
        .from('recipes')
        .select('title')
        .eq('household_id', HOUSEHOLD_ID)
      if (exErr) throw exErr
      const known = new Set((existing ?? []).map(r => r.title.trim().toLowerCase()))

      const parsed = recipes.filter(r => (r.title ?? '').trim())
      const fresh = parsed.filter(r => !known.has(r.title!.trim().toLowerCase()))
      const skipped = parsed.length - fresh.length

      const rows = fresh.map(r => {
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

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('recipes').insert(rows as never)
        if (insErr) throw insErr
      }
      return { count: rows.length, skipped, truncated: !!data?.truncated }
    },
    onSuccess: ({ count, skipped, truncated }) => {
      queryClient.invalidateQueries({ queryKey: RECIPES_KEY })
      const parts: string[] = []
      if (count > 0) parts.push(`${count} recette${count > 1 ? 's' : ''} importée${count > 1 ? 's' : ''}`)
      if (skipped > 0) parts.push(`${skipped} déjà présente${skipped > 1 ? 's' : ''} ignorée${skipped > 1 ? 's' : ''}`)
      if (truncated) parts.push('PDF tronqué — relance sur le reste')
      showToast({ type: 'success', message: `${parts.join(', ')}.` })
    },
    onError: (e: Error) => {
      showToast({ type: 'error', message: e.message })
    },
  })
}
