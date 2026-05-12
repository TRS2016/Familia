import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { QK } from '../lib/query-keys'

export interface Member {
  id: string
  user_id: string
  household_id: string
  display_name: string
  email: string | null
  created_at: string
}

export function useMember() {
  const { session } = useAuth()
  const userId = session?.user.id

  return useQuery({
    queryKey: QK.member(userId!),
    queryFn: async (): Promise<Member | null> => {
      if (!userId) return null
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Member | null
    },
    enabled: !!userId,
  })
}
