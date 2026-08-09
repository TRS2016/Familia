import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { MEDIA_FILES_KEY } from './useLecteur'
import { LECTEUR_QUEUE_KEY } from './useLecteurQueue'

export interface PartyToken {
  token: string
  expires_at: string
  moderated: boolean
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
      // Propager l'erreur : un échec réseau silencieux ferait recréer un token
      // (et invaliderait le QR déjà affiché chez un autre membre).
      const { data, error } = await supabase
        .from('lecteur_party_tokens')
        .select('token, expires_at, moderated')
        .eq('household_id', HOUSEHOLD_ID)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
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
        .select('token, expires_at, moderated')
        .single()
      if (error) throw error
      return data as unknown as PartyToken
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de créer le lien.' }),
  })

  const revoke = useMutation({
    mutationFn: async ({ purgeGuestTracks }: { purgeGuestTracks: boolean }) => {
      const { error } = await supabase.from('lecteur_party_tokens').delete().eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      if (purgeGuestTracks) {
        // Morceaux ajoutés par les invités : liens externes uniquement
        // (member_id null + tag posé par l'Edge Function jukebox), donc rien
        // à nettoyer côté Storage. La file suit par cascade.
        const { error: purgeError } = await supabase
          .from('media_files')
          .delete()
          .eq('household_id', HOUSEHOLD_ID)
          .is('member_id', null)
          .contains('tags', ['soirée'])
        if (purgeError) throw purgeError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: MEDIA_FILES_KEY })
      queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de fermer le lien.' }),
  })

  // Active/désactive la modération des demandes invitées (lue par l'Edge Function).
  const setModerated = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase
        .from('lecteur_party_tokens')
        .update({ moderated: on } as never)
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
    },
    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: KEY })
      const previous = queryClient.getQueryData<PartyToken | null>(KEY)
      if (previous) queryClient.setQueryData<PartyToken>(KEY, { ...previous, moderated: on })
      return { previous }
    },
    onError: (_e, _on, ctx) => {
      queryClient.setQueryData(KEY, ctx?.previous ?? null)
      showToast({ type: 'error', message: 'Impossible de changer la modération.' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return { query, create, revoke, setModerated }
}
