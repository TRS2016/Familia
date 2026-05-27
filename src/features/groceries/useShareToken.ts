import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

const SHARE_TOKEN_KEY = ['share-token', HOUSEHOLD_ID] as const

export interface ShareToken {
  token: string
  expires_at: string
}

export function useShareToken() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: SHARE_TOKEN_KEY,
    queryFn: async (): Promise<ShareToken | null> => {
      const { data } = await supabase
        .from('shared_list_tokens')
        .select('token, expires_at')
        .eq('household_id', HOUSEHOLD_ID)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as unknown as ShareToken | null) ?? null
    },
  })

  const create = useMutation({
    mutationFn: async (): Promise<ShareToken> => {
      await supabase.from('shared_list_tokens').delete().eq('household_id', HOUSEHOLD_ID)
      const { data, error } = await supabase
        .from('shared_list_tokens')
        .insert({ household_id: HOUSEHOLD_ID, created_by: member?.id ?? null })
        .select('token, expires_at')
        .single()
      if (error) throw error
      return data as unknown as ShareToken
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHARE_TOKEN_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de créer le lien de partage.' }),
  })

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shared_list_tokens')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHARE_TOKEN_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de révoquer le lien.' }),
  })

  return { query, create, revoke }
}
