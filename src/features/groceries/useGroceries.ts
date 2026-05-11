import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'

export const GROCERIES_KEY = ['groceries', HOUSEHOLD_ID] as const

export interface Grocery {
  id: string
  household_id: string
  created_by: string | null
  name: string
  quantity: string | null
  checked: boolean
  checked_by: string | null
  checked_at: string | null
  created_at: string
  created_by_member: { display_name: string } | null
  checked_by_member: { display_name: string } | null
}

// Reused in add mutation to also return joined member names.
const GROCERY_SELECT = `
  *,
  created_by_member:members!groceries_created_by_fkey(display_name),
  checked_by_member:members!groceries_checked_by_fkey(display_name)
`.trim()

export function useGroceries() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()

  // ── Query ────────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: GROCERIES_KEY,
    queryFn: async (): Promise<Grocery[]> => {
      const { data, error } = await supabase
        .from('groceries')
        .select(GROCERY_SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        // Coarse server-side ordering: unchecked first, then by creation date.
        // GroceriesPage refines this with client-side sort for checked_at ordering.
        .order('checked', { ascending: true })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Grocery[]
    },
  })

  // ── Add ──────────────────────────────────────────────────────────────────
  const addGrocery = useMutation({
    mutationFn: async (name: string): Promise<Grocery> => {
      const { data, error } = await supabase
        .from('groceries')
        .insert({
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
          name: name.trim(),
        })
        .select(GROCERY_SELECT)
        .single()
      if (error) throw error
      return data as unknown as Grocery
    },
    onMutate: async (name: string) => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []
      const optimisticId = `optimistic-${Date.now()}`

      const optimistic: Grocery = {
        id: optimisticId,
        household_id: HOUSEHOLD_ID,
        created_by: member?.id ?? null,
        name: name.trim(),
        quantity: null,
        checked: false,
        checked_by: null,
        checked_at: null,
        created_at: new Date().toISOString(),
        created_by_member: member ? { display_name: member.display_name } : null,
        checked_by_member: null,
      }

      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, [optimistic, ...previous])
      return { previous, optimisticId }
    },
    onError: (_err, _name, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      alert('Erreur lors de l\'ajout. Réessaie.')
    },
    onSuccess: (newItem, _name, context) => {
      if (!context) return
      // Swap the optimistic placeholder for the real server row.
      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, (old = []) =>
        old.map(g => g.id === context.optimisticId ? newItem : g)
      )
    },
  })

  // ── Toggle ───────────────────────────────────────────────────────────────
  const toggleGrocery = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase
        .from('groceries')
        .update({
          checked,
          checked_by: checked ? (member?.id ?? null) : null,
          checked_at: checked ? new Date().toISOString() : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []

      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, previous.map(g =>
        g.id === id
          ? {
              ...g,
              checked,
              checked_by: checked ? (member?.id ?? null) : null,
              checked_at: checked ? new Date().toISOString() : null,
              checked_by_member: checked && member
                ? { display_name: member.display_name }
                : null,
            }
          : g
      ))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      alert('Erreur lors de la mise à jour.')
    },
  })

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteGrocery = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('groceries').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []
      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, previous.filter(g => g.id !== id))
      return { previous }
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      alert('Erreur lors de la suppression.')
    },
  })

  return { query, addGrocery, toggleGrocery, deleteGrocery }
}
