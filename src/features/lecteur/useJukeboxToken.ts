import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

export interface PartyToken {
  token: string
  expires_at: string
}

const KEY = ['jukebox-party-token', HOUSEHOLD_ID] as const

// Lien invité de soirée : un token court (valable 1 jour) que des non-membres
// utilisent pour ajouter des morceaux à la file via l'Edge Function `jukebox`.
export function useJukeboxToken() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<PartyToken | null> => {
      const { data } = await supabase
        .from('lecteur_party_tokens')
        .select('token, expires_at')
        .eq('household_id', HOUSEHOLD_ID)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as unknown as PartyToken | null) ?? null
    },
  })

  const create = useMutation({
    mutationFn: async (): Promise<PartyToken> => {
      // Un seul lien actif à la fois : on remplace l'éventuel précédent.
      await supabase.from('lecteur_party_tokens').delete().eq('household_id', HOUSEHOLD_ID)
      const { data, error } = await supabase
        .from('lecteur_party_tokens')
        .insert({ household_id: HOUSEHOLD_ID, created_by: member?.id ?? null } as never)
        .select('token, expires_at')
        .single()
      if (error) throw error
      return data as unknown as PartyToken
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de créer le lien.' }),
  })

  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('lecteur_party_tokens').delete().eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de fermer le lien.' }),
  })

  return { query, create, revoke }
}
