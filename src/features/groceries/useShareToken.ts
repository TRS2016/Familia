import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

export interface ShareToken {
  token: string
  expires_at: string
}

export function useShareToken(listId: string) {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  const queryKey = ['share-token', HOUSEHOLD_ID, listId] as const

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ShareToken | null> => {
      // Propager l'erreur : un échec réseau silencieux serait pris pour
      // « pas de token » et l'UI proposerait d'en recréer un (invalidant
      // le lien déjà partagé).
      const { data, error } = await supabase
        .from('shared_list_tokens')
        .select('token, expires_at')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as ShareToken | null) ?? null
    },
  })

  const create = useMutation({
    mutationFn: async (): Promise<ShareToken> => {
      await supabase
        .from('shared_list_tokens')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)
      const { data, error } = await supabase
        .from('shared_list_tokens')
        .insert({ household_id: HOUSEHOLD_ID, created_by: member?.id ?? null, list_id: listId })
        .select('token, expires_at')
        .single()
      if (error) throw error
      return data as unknown as ShareToken
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => showToast({ type: 'error', message: 'Impossible de créer le lien de partage.' }),
  })

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('shared_list_tokens')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => showToast({ type: 'error', message: 'Impossible de révoquer le lien.' }),
  })

  return { query, create, revoke }
}
