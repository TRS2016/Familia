import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediaType   = 'film' | 'série' | 'livre' | 'jeu'
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
  author_director: string | null
  release_year: number | null
  genre: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  member: { display_name: string } | null
  external_url: string | null
  // kept in DB for Phase 2 (lecteur), not shown in catalogue
  file_path: string | null
  mime_type: string | null
}

export interface NewMediaInput {
  title: string
  type: MediaType
  member_id: string | null
  author_director?: string | null
  release_year?: number | null
  genre?: string | null
  external_url?: string | null
}

export interface UpdateMediaInput {
  id: string
  title?: string
  type?: MediaType
  author_director?: string | null
  release_year?: number | null
  genre?: string | null
  rating?: number | null
  comment?: string | null
  external_url?: string | null
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const MEDIA_KEY = ['media-items', HOUSEHOLD_ID] as const

// ── Constants ─────────────────────────────────────────────────────────────────

export const NEXT_STATUS: Record<MediaStatus, MediaStatus> = {
  'à voir':   'en cours',
  'en cours': 'terminé',
  'terminé':  'à voir',
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

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
    mutationFn: async (input: NewMediaInput): Promise<MediaItem> => {
      const { data, error } = await supabase
        .from('media_items')
        .insert({
          household_id:    HOUSEHOLD_ID,
          member_id:       input.member_id ?? member?.id ?? null,
          title:           input.title.trim(),
          type:            input.type,
          status:          'à voir',
          author_director: input.author_director ?? null,
          release_year:    input.release_year ?? null,
          genre:           input.genre ?? null,
          external_url:    input.external_url?.trim() || null,
        } as never)
        .select('*, member:members(display_name)')
        .single()
      if (error) throw error
      return data as unknown as MediaItem
    },
    onMutate: async (input: NewMediaInput) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      const optimistic: MediaItem = {
        id:              `optimistic-${Date.now()}`,
        household_id:    HOUSEHOLD_ID,
        member_id:       input.member_id ?? member?.id ?? null,
        title:           input.title.trim(),
        type:            input.type,
        status:          'à voir',
        rating:          null,
        comment:         null,
        author_director: input.author_director ?? null,
        release_year:    input.release_year ?? null,
        genre:           input.genre ?? null,
        started_at:      null,
        finished_at:     null,
        created_at:      new Date().toISOString(),
        member:          member ? { display_name: member.display_name } : null,
        external_url:    input.external_url?.trim() || null,
        file_path:       null,
        mime_type:       null,
      }
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, [optimistic, ...previous])
      return { previous, optimisticId: optimistic.id }
    },
    onSuccess: (newItem, _input, context) => {
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, old =>
        (old ?? []).map(m => m.id === context?.optimisticId ? newItem : m)
      )
    },
    onError: (_err, _input, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: "Impossible d'ajouter l'élément." })
    },
  })
}

export function useUpdateMediaStatus() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, status, current }: { id: string; status: MediaStatus; current: MediaItem }) => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const patch: Partial<MediaItem> = { status }
      if (status === 'en cours' && !current.started_at) patch.started_at = today
      if (status === 'terminé') patch.finished_at = today
      if (status === 'à voir')  patch.finished_at = null
      const { error } = await supabase.from('media_items').update(patch as never).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, status, current }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      const today = format(new Date(), 'yyyy-MM-dd')
      const patch: Partial<MediaItem> = { status }
      if (status === 'en cours' && !current.started_at) patch.started_at = today
      if (status === 'terminé') patch.finished_at = today
      if (status === 'à voir')  patch.finished_at = null
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, ...patch } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour le statut.' })
    },
  })
}

export function useUpdateMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdateMediaInput) => {
      const { error } = await supabase.from('media_items').update(fields as never).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, ...fields }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, ...fields } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder.' })
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
      showToast({ type: 'error', message: "Impossible de supprimer l'élément." })
    },
  })
}
