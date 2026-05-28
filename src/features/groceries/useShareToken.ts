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
      // list_id column added in migration 20260528 — not yet in generated types, hence the cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder = supabase.from('shared_list_tokens').select('token, expires_at') as any
      const { data } = await builder
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as unknown as ShareToken | null) ?? null
    },
  })

  const create = useMutation({
    mutationFn: async (): Promise<ShareToken> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('shared_list_tokens').delete() as any)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)

      const { data, error } = await supabase
        .from('shared_list_tokens')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ household_id: HOUSEHOLD_ID, created_by: member?.id ?? null, list_id: listId } as any)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('shared_list_tokens').delete() as any)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('list_id', listId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: () => showToast({ type: 'error', message: 'Impossible de révoquer le lien.' }),
  })

  return { query, create, revoke }
}
