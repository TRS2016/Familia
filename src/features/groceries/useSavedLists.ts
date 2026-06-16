import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'

export const SAVED_LISTS_KEY = ['grocery-saved-lists', HOUSEHOLD_ID] as const

export function savedItemsKey(listId: string) {
  return ['grocery-saved-items', listId] as const
}

export interface SavedList {
  id: string
  household_id: string
  name: string
  created_at: string
  item_count: number
}

export interface SavedItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  price: number | null
  category: string | null
  store: string | null
  created_at: string
}

// Supabase returns count aggregates as an array — not reflected in generated types
interface RawListWithCount {
  id: string
  household_id: string
  name: string
  created_at: string
  grocery_saved_items: Array<{ count: number }>
}

type RawListRow = Omit<SavedList, 'item_count'>
type SavedItemPartial = Pick<SavedItem, 'name' | 'quantity' | 'price' | 'category' | 'store'>

// ── Listes ────────────────────────────────────────────────────────────────────

export function useSavedLists() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: SAVED_LISTS_KEY,
    queryFn: async (): Promise<SavedList[]> => {
      const { data, error } = await supabase
        .from('grocery_saved_lists')
        .select('*, grocery_saved_items(count)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as unknown as RawListWithCount[]).map(d => ({
        id: d.id,
        household_id: d.household_id,
        name: d.name,
        created_at: d.created_at,
        item_count: d.grocery_saved_items?.[0]?.count ?? 0,
      }))
    },
  })

  const createList = useMutation({
    mutationFn: async ({ name }: { name: string }): Promise<SavedList> => {
      const { data, error } = await supabase
        .from('grocery_saved_lists')
        .insert({ household_id: HOUSEHOLD_ID, name: name.trim() })
        .select()
        .single()
      if (error) throw error
      return { ...(data as unknown as RawListRow), item_count: 0 }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de créer la liste.' }),
  })

  const renameList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('grocery_saved_lists')
        .update({ name: name.trim() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de renommer la liste.' }),
  })

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('grocery_saved_lists')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de supprimer la liste.' }),
  })

  const duplicateList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }): Promise<SavedList> => {
      const { data: newList, error: listErr } = await supabase
        .from('grocery_saved_lists')
        .insert({ household_id: HOUSEHOLD_ID, name })
        .select()
        .single()
      if (listErr) throw listErr

      const { data: items, error: itemsErr } = await supabase
        .from('grocery_saved_items')
        .select('name, quantity, price, category, store')
        .eq('list_id', id)
      if (itemsErr) throw itemsErr

      if (items && items.length > 0) {
        const { error: insertErr } = await supabase
          .from('grocery_saved_items')
          .insert((items as unknown as SavedItemPartial[]).map(item => ({ ...item, list_id: (newList as unknown as RawListRow).id })))
        if (insertErr) throw insertErr
      }

      return { ...(newList as unknown as RawListRow), item_count: items?.length ?? 0 }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de dupliquer la liste.' }),
  })

  return { query, createList, renameList, deleteList, duplicateList }
}

// ── Articles d'une liste ──────────────────────────────────────────────────────

export function useSavedListDetail(listId: string) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: savedItemsKey(listId),
    queryFn: async (): Promise<SavedItem[]> => {
      const { data, error } = await supabase
        .from('grocery_saved_items')
        .select('*')
        .eq('list_id', listId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as SavedItem[]
    },
  })

  const addItem = useMutation({
    mutationFn: async (item: Omit<SavedItem, 'id' | 'list_id' | 'created_at'>): Promise<SavedItem> => {
      const { data, error } = await supabase
        .from('grocery_saved_items')
        .insert({ ...item, list_id: listId })
        .select()
        .single()
      if (error) throw error
      return data as SavedItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedItemsKey(listId) })
      queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY })
    },
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter l'article." }),
  })

  const updateItem = useMutation({
    mutationFn: async ({ id, ...fields }: Partial<Omit<SavedItem, 'list_id' | 'created_at'>> & { id: string }) => {
      const { error } = await supabase
        .from('grocery_saved_items')
        .update(fields)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedItemsKey(listId) }),
    onError: () => showToast({ type: 'error', message: "Impossible de modifier l'article." }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('grocery_saved_items')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedItemsKey(listId) })
      queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY })
    },
    onError: () => showToast({ type: 'error', message: "Impossible de supprimer l'article." }),
  })

  const moveItem = useMutation({
    mutationFn: async ({ item, toListId }: { item: SavedItem; toListId: string }) => {
      // RPC atomique : copie vers la liste cible + suppression de l'origine en une
      // transaction (un échec ne duplique plus l'article dans les deux listes).
      const { error } = await supabase.rpc('move_saved_item', { p_item: item.id, p_to_list: toListId })
      if (error) throw error
    },
    onSuccess: (_data, { toListId }) => {
      queryClient.invalidateQueries({ queryKey: savedItemsKey(listId) })
      queryClient.invalidateQueries({ queryKey: savedItemsKey(toListId) })
      queryClient.invalidateQueries({ queryKey: SAVED_LISTS_KEY })
    },
    onError: () => showToast({ type: 'error', message: "Impossible de déplacer l'article." }),
  })

  return { query, addItem, updateItem, deleteItem, moveItem }
}
