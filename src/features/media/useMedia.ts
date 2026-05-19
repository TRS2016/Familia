import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/Toast'

export type MediaType   = 'film' | 'série' | 'livre'
export type MediaStatus = 'à voir' | 'en cours' | 'terminé'

export interface MediaItem {
  id: string
  household_id: string
  member_id: string | null
  title: string
  type: MediaType
  status: MediaStatus
  rating: number | null
  comment: string | null
  created_at: string
  member: { display_name: string } | null
}

export interface NewMediaInput {
  title: string
  type: MediaType
  member_id: string | null
}

export const MEDIA_KEY = ['media-items', HOUSEHOLD_ID] as const

const NEXT_STATUS: Record<MediaStatus, MediaStatus> = {
  'à voir':  'en cours',
  'en cours': 'terminé',
  'terminé':  'à voir',
}
export { NEXT_STATUS }

export function useMediaItems() {
  return useQuery({
    queryKey: MEDIA_KEY,
    queryFn: async (): Promise<MediaItem[]> => {
      const { data, error } = await supabase
        .from('media_items')
        .select('*, member:members(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as MediaItem[]
    },
  })
}

export function useAddMediaItem() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: NewMediaInput) => {
      const { error } = await supabase.from('media_items').insert({
        household_id: HOUSEHOLD_ID,
        member_id: input.member_id ?? member?.id ?? null,
        title: input.title.trim(),
        type: input.type,
        status: 'à voir',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEDIA_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible d\'ajouter l\'élément.' }),
  })
}

export function useUpdateMediaStatus() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MediaStatus }) => {
      const { error } = await supabase.from('media_items').update({ status }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, status } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour le statut.' })
    },
  })
}

export function useCommentMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string | null }) => {
      const { error } = await supabase.from('media_items').update({ comment }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, comment }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, comment } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder le commentaire.' })
    },
  })
}

export function useRateMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number | null }) => {
      const { error } = await supabase.from('media_items').update({ rating }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, rating }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, rating } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder la note.' })
    },
  })
}

export function useDeleteMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('media_items').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, previous.filter(m => m.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer l\'élément.' })
    },
  })
}
