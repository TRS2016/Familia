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

  // Remplace tout le catalogue par les lignes importées (CSV).
  // Stratégie : insérer les nouvelles lignes PUIS supprimer les anciennes →
  // en cas d'échec de l'insert, les données existantes restent intactes.
  const replaceCatalog = useMutation({
    mutationFn: async (rows: {
      name: string
      price: number | null
      quantity: string | null
      category: string | null
      store: string | null
    }[]): Promise<number> => {
      const previous = queryClient.getQueryData<CatalogItem[]>(CATALOG_KEY) ?? []

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from('grocery_catalog')
          .insert(rows.map(r => ({
            household_id: HOUSEHOLD_ID,
            name: r.name.trim(),
            price: r.price ?? null,
            quantity: r.quantity?.trim() || null,
            category: r.category?.trim() || null,
            store: r.store?.trim() || null,
          })))
        if (insErr) throw insErr
      }

      if (previous.length > 0) {
        const { error: delErr } = await supabase
          .from('grocery_catalog')
          .delete()
          .in('id', previous.map(p => p.id))
        if (delErr) throw delErr
      }

      return rows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
      showToast({ type: 'success', message: `Catalogue importé — ${count} article${count > 1 ? 's' : ''}.` })
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY })
      showToast({ type: 'error', message: "Échec de l'import du catalogue." })
    },
  })

  return { query, addItem, updateItem, deleteItem, replaceCatalog }
}
