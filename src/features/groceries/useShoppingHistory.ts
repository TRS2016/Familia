import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

export interface SessionItem {
  name: string
  qty: string | null
  price: number | null
  store: string | null
}

export interface ShoppingSession {
  id: string
  household_id: string
  done_by: string | null
  total: number | null
  item_count: number
  items: SessionItem[]
  created_at: string
  done_by_member: { display_name: string } | null
}

const SESSIONS_KEY = ['shopping-sessions', HOUSEHOLD_ID] as const

export function useShoppingHistory(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async (): Promise<ShoppingSession[]> => {
      const { data, error } = await supabase
        .from('shopping_sessions')
        .select('*, done_by_member:members!shopping_sessions_done_by_fkey(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as unknown as ShoppingSession[]
    },
    enabled: opts?.enabled ?? true,
  })
}

export function useSaveSession() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ items, total }: { items: SessionItem[]; total: number | null }) => {
      const { error } = await supabase
        .from('shopping_sessions')
        .insert({
          household_id: HOUSEHOLD_ID,
          done_by: member?.id ?? null,
          total: total ?? null,
          item_count: items.length,
          items: items as unknown as Json,
        })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de sauvegarder la session.' }),
  })
}
