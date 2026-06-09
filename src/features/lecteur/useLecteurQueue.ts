import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import type { MediaFile } from './useLecteur'

// ── Type ────────────────────────────────────────────────────────────────────
export interface QueueItem {
  id: string
  media_file_id: string
  position: number
  added_by: string | null
  guest_name: string | null
  played: boolean
  created_at: string
  media_file: MediaFile | null
  added_by_member: { display_name: string } | null
}

export const LECTEUR_QUEUE_KEY = ['lecteur-queue', HOUSEHOLD_ID] as const

const SELECT =
  '*, media_file:media_files(*, member:members(display_name)), added_by_member:members!lecteur_queue_added_by_fkey(display_name)'

// File d'attente partagée : morceaux non encore joués, ordonnés.
export function useLecteurQueue() {
  return useQuery({
    queryKey: LECTEUR_QUEUE_KEY,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from('lecteur_queue')
        .select(SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('played', false)
        .order('position', { ascending: true })
      if (error) throw error
      return data as unknown as QueueItem[]
    },
  })
}

export function useAddToQueue() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (mediaFileId: string) => {
      const { error } = await supabase
        .from('lecteur_queue')
        .insert({
          household_id:  HOUSEHOLD_ID,
          media_file_id: mediaFileId,
          added_by:      member?.id ?? null,
          position:      Date.now(), // clé d'ordre = ordre d'ajout
        } as never)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY })
      showToast({ type: 'success', message: 'Ajouté à la file 🎉' })
    },
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter à la file." }),
  })
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lecteur_queue').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY, previous.filter(q => q.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Action impossible.' })
    },
  })
}

// Marque un item comme joué (le retire de la file active). Utilisé par le DJ
// quand la piste se termine.
export function useMarkQueuePlayed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lecteur_queue')
        .update({ played: true } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY, previous.filter(q => q.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
    },
  })
}

export function useClearQueue() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('lecteur_queue')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de vider la file.' }),
  })
}
