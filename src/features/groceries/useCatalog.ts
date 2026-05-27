import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'

export const CATALOG_KEY = ['grocery-catalog', HOUSEHOLD_ID] as const

export type CatalogItem = Tables<'grocery_catalog'>

export function useCatalog() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase
        .from('grocery_catalog')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const addItem = useMutation({
    mutationFn: async (item: {
      name: string
      price?: number | null
      quantity?: string | null
      category?: string | null
      store?: string | null
    }): Promise<CatalogItem> => {
      const { data, error } = await supabase
        .from('grocery_catalog')
        .insert({
          household_id: HOUSEHOLD_ID,
          name: item.name.trim(),
          price: item.price ?? null,
          quantity: item.quantity?.trim() || null,
          category: item.category || null,
          store: item.store?.trim() || null,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter l'article." }),
  })

  const updateItem = useMutation({
    mutationFn: async (item: {
      id: string
      name: string
      price?: number | null
      quantity?: string | null
      category?: string | null
      store?: string | null
    }) => {
      const { error } = await supabase
        .from('grocery_catalog')
        .update({
          name: item.name.trim(),
          price: item.price ?? null,
          quantity: item.quantity?.trim() || null,
          category: item.category || null,
          store: item.store?.trim() || null,
        })
        .eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
    onError: () => showToast({ type: 'error', message: "Impossible de modifier l'article." }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('grocery_catalog')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CATALOG_KEY })
      const previous = queryClient.getQueryData<CatalogItem[]>(CATALOG_KEY) ?? []
      queryClient.setQueryData<CatalogItem[]>(CATALOG_KEY, previous.filter(i => i.id !== id))
      return { previous }
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(CATALOG_KEY, context?.previous ?? [])
      showToast({ type: 'error', message: "Impossible de supprimer l'article." })
    },
  })

  return { query, addItem, updateItem, deleteItem }
}
