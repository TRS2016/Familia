import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

export const GROCERIES_KEY = ['groceries', HOUSEHOLD_ID] as const

export interface Grocery {
  id: string
  household_id: string
  created_by: string | null
  name: string
  quantity: string | null
  price: number | null
  category: string | null
  store: string | null
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
  const { showToast } = useToast()

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
    mutationFn: async ({ name, quantity, price, category, store }: { name: string; quantity?: string; price?: number; category?: string; store?: string }): Promise<Grocery> => {
      const { data, error } = await supabase
        .from('groceries')
        .insert({
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
          name: name.trim(),
          quantity: quantity?.trim() || null,
          price: price ?? null,
          category: category || null,
          store: store?.trim() || null,
        })
        .select(GROCERY_SELECT)
        .single()
      if (error) throw error
      return data as unknown as Grocery
    },
    onMutate: async ({ name, quantity, price, category, store }) => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []
      const optimisticId = `optimistic-${Date.now()}`

      const optimistic: Grocery = {
        id: optimisticId,
        household_id: HOUSEHOLD_ID,
        created_by: member?.id ?? null,
        name: name.trim(),
        quantity: quantity?.trim() || null,
        price: price ?? null,
        category: category || null,
        store: store?.trim() || null,
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
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible d\'ajouter l\'article. Réessaie.' })
    },
    onSuccess: (newItem, _vars, context) => {
      if (!context) return
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
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'article.' })
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
      showToast({ type: 'error', message: 'Impossible de supprimer l\'article.' })
    },
  })

  // ── Clear checked ─────────────────────────────────────────────────────────
  const clearChecked = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('groceries')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
        .eq('checked', true)
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []
      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, previous.filter(g => !g.checked))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de vider les articles cochés.' })
    },
  })

  // ── Update ───────────────────────────────────────────────────────────────
  const updateGrocery = useMutation({
    mutationFn: async ({ id, name, quantity, price, category, store }: {
      id: string; name: string; quantity?: string; price?: number | null; category?: string | null; store?: string | null
    }) => {
      const { error } = await supabase
        .from('groceries')
        .update({ name: name.trim(), quantity: quantity?.trim() || null, price: price ?? null, category: category || null, store: store?.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, name, quantity, price, category, store }) => {
      await queryClient.cancelQueries({ queryKey: GROCERIES_KEY })
      const previous = queryClient.getQueryData<Grocery[]>(GROCERIES_KEY) ?? []
      queryClient.setQueryData<Grocery[]>(GROCERIES_KEY, previous.map(g =>
        g.id === id
          ? { ...g, name: name.trim(), quantity: quantity?.trim() || null, price: price ?? null, category: category || null, store: store?.trim() || null }
          : g
      ))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(GROCERIES_KEY, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de modifier l\'article.' })
    },
  })

  // ── Load saved list (batch insert) ───────────────────────────────────────
  const loadSavedList = useMutation({
    mutationFn: async (items: Array<{
      name: string
      quantity?: string | null
      price?: number | null
      category?: string | null
      store?: string | null
    }>) => {
      const { error } = await supabase
        .from('groceries')
        .insert(items.map(item => ({
          household_id: HOUSEHOLD_ID,
          created_by: member?.id ?? null,
          name: item.name,
          quantity: item.quantity || null,
          price: item.price ?? null,
          category: item.category || null,
          store: item.store || null,
        })))
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROCERIES_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de charger la liste.' }),
  })

  // ── Replace with saved list (clear all + insert) ──────────────────────────
  const replaceWithList = useMutation({
    mutationFn: async (items: Array<{
      name: string
      quantity?: string | null
      price?: number | null
      category?: string | null
      store?: string | null
    }>) => {
      const { error: deleteErr } = await supabase
        .from('groceries')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
      if (deleteErr) throw deleteErr
      if (items.length > 0) {
        const { error: insertErr } = await supabase
          .from('groceries')
          .insert(items.map(item => ({
            household_id: HOUSEHOLD_ID,
            created_by: member?.id ?? null,
            name: item.name,
            quantity: item.quantity || null,
            price: item.price ?? null,
            category: item.category || null,
            store: item.store || null,
          })))
        if (insertErr) throw insertErr
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROCERIES_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de charger la liste.' }),
  })

  // ── Save current list as template ────────────────────────────────────────
  const saveCurrentList = useMutation({
    mutationFn: async ({ name, items }: {
      name: string
      items: Array<{ name: string; quantity: string | null; price: number | null; category: string | null; store: string | null }>
    }) => {
      const { data: list, error: listErr } = await supabase
        .from('grocery_saved_lists')
        .insert({ household_id: HOUSEHOLD_ID, name })
        .select()
        .single()
      if (listErr) throw listErr

      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from('grocery_saved_items')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(items.map(item => ({ ...item, list_id: (list as any).id })))
        if (itemsErr) throw itemsErr
      }
      return list
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de sauvegarder la liste.' }),
  })

  return { query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery, clearChecked, loadSavedList, replaceWithList, saveCurrentList }
}
