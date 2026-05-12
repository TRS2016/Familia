import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { QK } from '../lib/query-keys'
import type { Tables } from '../lib/database.types'

export type Member = Tables<'members'>

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
      return data
    },
    enabled: !!userId,
  })
}
